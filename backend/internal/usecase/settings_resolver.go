package usecase

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/enterprise-pos/backend/internal/domain"
	"github.com/enterprise-pos/backend/internal/infrastructure/ws"
	"github.com/enterprise-pos/backend/internal/repository/sqlc/db"
	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
)

type cachedSettingsEntry struct {
	payload   []domain.ResolvedSetting
	expiresAt time.Time
	cachedAt  time.Time
}

// SettingsContext identifies the 6-level resolution hierarchy targets.
type SettingsContext struct {
	BusinessID uuid.UUID
	BranchID   *uuid.UUID
	TerminalID *uuid.UUID
	CategoryID *uuid.UUID
	ProductID  *uuid.UUID
}

// SettingsResolver resolves 6-level inherited settings with Redis hash caching, local TTL fallback, and WebSocket updates.
type SettingsResolver struct {
	queries  *db.Queries
	redis    *redis.Client
	hub      *ws.Hub
	memMu    sync.RWMutex
	memCache map[string]cachedSettingsEntry
}

// NewSettingsResolver constructs a SettingsResolver instance.
func NewSettingsResolver(queries *db.Queries, rdb *redis.Client, hub *ws.Hub) *SettingsResolver {
	return &SettingsResolver{
		queries:  queries,
		redis:    rdb,
		hub:      hub,
		memCache: make(map[string]cachedSettingsEntry),
	}
}

// ResolveAll evaluates every setting across System -> Business -> Branch -> Terminal -> Category -> Product.
func (s *SettingsResolver) ResolveAll(ctx context.Context, sc SettingsContext) ([]domain.ResolvedSetting, error) {
	resolved, _, _, err := s.ResolveAllWithMeta(ctx, sc)
	return resolved, err
}

// ResolveAllWithMeta evaluates settings and returns whether the value came from Redis/Memory cache or PostgreSQL.
func (s *SettingsResolver) ResolveAllWithMeta(ctx context.Context, sc SettingsContext) ([]domain.ResolvedSetting, string, time.Time, error) {
	cacheKey := s.cacheKey(sc)
	now := time.Now().UTC()

	if s.redis != nil {
		if cached, err := s.redis.Get(ctx, cacheKey).Result(); err == nil && cached != "" {
			var out []domain.ResolvedSetting
			if jsonErr := json.Unmarshal([]byte(cached), &out); jsonErr == nil {
				s.setMemoryCache(cacheKey, out, now)
				return out, "REDIS_CACHE", now, nil
			}
		}
	}

	s.memMu.RLock()
	entry, ok := s.memCache[cacheKey]
	s.memMu.RUnlock()
	if ok && now.Before(entry.expiresAt) {
		return entry.payload, "MEMORY_CACHE", entry.cachedAt, nil
	}

	defs, err := s.queries.ListSettingDefinitions(ctx)
	if err != nil {
		return nil, "", now, err
	}
	overrides, err := s.queries.ListScopedSettingsForBusiness(ctx, sc.BusinessID)
	if err != nil {
		return nil, "", now, err
	}

	resolved := ResolveSettingsHierarchy(defs, overrides, sc)
	source := "DB_CACHED_LOCAL"

	s.setMemoryCache(cacheKey, resolved, now)
	if s.redis != nil {
		if payload, err := json.Marshal(resolved); err == nil {
			if setErr := s.redis.Set(ctx, cacheKey, payload, 15*time.Minute).Err(); setErr == nil {
				source = "DB_CACHED_REDIS"
			}
		}
	}
	return resolved, source, now, nil
}

func (s *SettingsResolver) setMemoryCache(cacheKey string, resolved []domain.ResolvedSetting, now time.Time) {
	if s.memCache == nil {
		return
	}
	copied := make([]domain.ResolvedSetting, len(resolved))
	copy(copied, resolved)
	s.memMu.Lock()
	s.memCache[cacheKey] = cachedSettingsEntry{
		payload:   copied,
		expiresAt: now.Add(15 * time.Minute),
		cachedAt:  now,
	}
	s.memMu.Unlock()
}

// GetString resolves a single string setting with fallback.
func (s *SettingsResolver) GetString(ctx context.Context, sc SettingsContext, key, fallback string) string {
	all, err := s.ResolveAll(ctx, sc)
	if err != nil {
		return fallback
	}
	for _, item := range all {
		if item.Key == key {
			var str string
			if err := json.Unmarshal([]byte(item.EffectiveJSON), &str); err == nil {
				return str
			}
			return strings.Trim(item.EffectiveJSON, "\"")
		}
	}
	return fallback
}

// GetBool resolves a single boolean setting with fallback.
func (s *SettingsResolver) GetBool(ctx context.Context, sc SettingsContext, key string, fallback bool) bool {
	all, err := s.ResolveAll(ctx, sc)
	if err != nil {
		return fallback
	}
	for _, item := range all {
		if item.Key == key {
			var b bool
			if err := json.Unmarshal([]byte(item.EffectiveJSON), &b); err == nil {
				return b
			}
		}
	}
	return fallback
}

// GetInt resolves a single integer/numeric setting with fallback.
func (s *SettingsResolver) GetInt(ctx context.Context, sc SettingsContext, key string, fallback int) int {
	all, err := s.ResolveAll(ctx, sc)
	if err != nil {
		return fallback
	}
	for _, item := range all {
		if item.Key == key {
			var n float64
			if err := json.Unmarshal([]byte(item.EffectiveJSON), &n); err == nil {
				return int(n)
			}
			var rawStr string
			if err := json.Unmarshal([]byte(item.EffectiveJSON), &rawStr); err == nil {
				var parsed int
				if _, scanErr := fmt.Sscanf(strings.TrimSpace(rawStr), "%d", &parsed); scanErr == nil {
					return parsed
				}
			}
		}
	}
	return fallback
}

// UpsertOverride persists a scoped override, invalidates Redis cache, and notifies terminals via WebSockets.
func (s *SettingsResolver) UpsertOverride(
	ctx context.Context,
	businessID, userID uuid.UUID,
	key, scopeLevel string,
	targetID *uuid.UUID,
	valueJSON json.RawMessage,
) error {
	if err := s.UpsertOverrideQuiet(ctx, businessID, userID, key, scopeLevel, targetID, valueJSON); err != nil {
		return err
	}
	s.invalidateAndBroadcast(ctx, businessID, key, scopeLevel, valueJSON)
	return nil
}

// UpsertOverrideQuiet persists a scoped override without emitting a WebSocket broadcast immediately.
func (s *SettingsResolver) UpsertOverrideQuiet(
	ctx context.Context,
	businessID, userID uuid.UUID,
	key, scopeLevel string,
	targetID *uuid.UUID,
	valueJSON json.RawMessage,
) error {
	var targetNull uuid.NullUUID
	if targetID != nil && *targetID != uuid.Nil {
		targetNull = uuid.NullUUID{UUID: *targetID, Valid: true}
	}
	_, err := s.queries.UpsertScopedSetting(ctx, db.UpsertScopedSettingParams{
		BusinessID:    businessID,
		SettingKey:    key,
		ScopeLevel:    strings.ToUpper(scopeLevel),
		ScopeTargetID: targetNull,
		ValueJson:     valueJSON,
		UpdatedBy:     uuid.NullUUID{UUID: userID, Valid: userID != uuid.Nil},
	})
	if err != nil {
		return err
	}
	if key == "accounting.base_currency" && strings.ToUpper(scopeLevel) == "BUSINESS" {
		var code string
		if uErr := json.Unmarshal(valueJSON, &code); uErr != nil {
			code = strings.Trim(strings.TrimSpace(string(valueJSON)), `"`)
		}
		if code = strings.ToUpper(strings.TrimSpace(code)); code != "" {
			_ = s.queries.UpdateBusinessBaseCurrency(ctx, db.UpdateBusinessBaseCurrencyParams{
				ID:           businessID,
				BaseCurrency: code,
			})
		}
	}
	if key == "system.default_language" && strings.ToUpper(scopeLevel) == "BUSINESS" {
		var lang string
		if uErr := json.Unmarshal(valueJSON, &lang); uErr != nil {
			lang = strings.Trim(strings.TrimSpace(string(valueJSON)), `"`)
		}
		if lang = normalizeLanguageCode(lang); lang != "" {
			_ = s.queries.UpdateBusinessDefaultLanguage(ctx, db.UpdateBusinessDefaultLanguageParams{
				ID:              businessID,
				DefaultLanguage: lang,
			})
		}
	}
	if key == "pos.ui.layout_mode" && strings.ToUpper(scopeLevel) == "BUSINESS" {
		var mode string
		if uErr := json.Unmarshal(valueJSON, &mode); uErr != nil {
			mode = strings.Trim(strings.TrimSpace(string(valueJSON)), `"`)
		}
		if normMode, ok := NormalizeIndustryProfile(mode); ok {
			_ = s.queries.UpdateBusinessIndustryProfile(ctx, db.UpdateBusinessIndustryProfileParams{
				ID:              businessID,
				IndustryProfile: normMode,
			})
		}
	}
	return nil
}

// ResetOverride removes an override at the requested scope so the parent value flows down.
func (s *SettingsResolver) ResetOverride(
	ctx context.Context,
	businessID uuid.UUID,
	key, scopeLevel string,
	targetID *uuid.UUID,
) error {
	targetUUID := uuid.Nil
	if targetID != nil {
		targetUUID = *targetID
	}
	if err := s.queries.DeleteScopedSetting(ctx, db.DeleteScopedSettingParams{
		BusinessID: businessID,
		SettingKey: key,
		ScopeLevel: strings.ToUpper(scopeLevel),
		Column4:    targetUUID,
	}); err != nil {
		return err
	}
	if key == "accounting.base_currency" && strings.ToUpper(scopeLevel) == "BUSINESS" {
		_ = s.queries.UpdateBusinessBaseCurrency(ctx, db.UpdateBusinessBaseCurrencyParams{
			ID:           businessID,
			BaseCurrency: "USD",
		})
	}
	if key == "system.default_language" && strings.ToUpper(scopeLevel) == "BUSINESS" {
		_ = s.queries.UpdateBusinessDefaultLanguage(ctx, db.UpdateBusinessDefaultLanguageParams{
			ID:              businessID,
			DefaultLanguage: "en",
		})
	}
	s.invalidateAndBroadcast(ctx, businessID, key, scopeLevel, nil)
	return nil
}

func (s *SettingsResolver) InvalidateAndWarmBusiness(ctx context.Context, businessID uuid.UUID, key, scopeLevel string) {
	s.invalidateAndBroadcast(ctx, businessID, key, scopeLevel, nil)
}

func (s *SettingsResolver) invalidateAndBroadcast(ctx context.Context, businessID uuid.UUID, key, scopeLevel string, valueJSON json.RawMessage) {
	prefix := fmt.Sprintf("settings:biz:%s:", businessID.String())
	if s.memCache != nil {
		s.memMu.Lock()
		for k := range s.memCache {
			if strings.HasPrefix(k, prefix) {
				delete(s.memCache, k)
			}
		}
		s.memMu.Unlock()
	}
	if s.redis != nil {
		pattern := prefix + "*"
		keys, err := s.redis.Keys(ctx, pattern).Result()
		if err == nil && len(keys) > 0 {
			_ = s.redis.Del(ctx, keys...).Err()
		}
	}
	// Immediately warm and cache the updated Business defaults in Redis & local cache.
	resolved, _, _, _ := s.ResolveAllWithMeta(ctx, SettingsContext{BusinessID: businessID})

	if s.hub != nil {
		payload := map[string]any{
			"setting_key": key,
			"scope_level": strings.ToUpper(scopeLevel),
			"updated_at":  time.Now().UTC(),
		}
		if len(valueJSON) > 0 {
			payload["value_json"] = string(valueJSON)
		}
		if len(resolved) > 0 {
			resolvedMap := make(map[string]string, len(resolved))
			for _, item := range resolved {
				resolvedMap[item.Key] = item.EffectiveJSON
			}
			payload["resolved_map"] = resolvedMap
		}
		if prof, err := s.queries.GetBusinessProfile(ctx, businessID); err == nil {
			profileMap := map[string]any{
				"business_id":         prof.ID.String(),
				"business_name":       prof.Name,
				"trade_name":          prof.TradeName,
				"legal_name":          prof.LegalName,
				"tax_registration_no": prof.TaxRegistrationNo,
				"base_currency":       prof.BaseCurrency,
				"primary_color_hex":   prof.PrimaryColorHex,
				"default_language":    prof.DefaultLanguage,
				"industry_profile":    prof.IndustryProfile,
			}
			// Include logos directly when reasonably sized (< 256KB) so WS updates apply immediately;
			// larger base64 assets trigger company-settings query invalidation on the frontend.
			if len(prof.LogoLightUrl) <= 262144 {
				profileMap["logo_light_url"] = prof.LogoLightUrl
			}
			if len(prof.LogoDarkUrl) <= 262144 {
				profileMap["logo_dark_url"] = prof.LogoDarkUrl
			}
			if len(prof.LogoReceiptUrl) <= 262144 {
				profileMap["logo_receipt_url"] = prof.LogoReceiptUrl
			}
			payload["profile"] = profileMap
		}
		s.hub.BroadcastTenant(businessID, "SETTINGS_UPDATED", payload)
	}
}

func normalizeLanguageCode(raw string) string {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "si", "ta", "en":
		return strings.ToLower(strings.TrimSpace(raw))
	default:
		return "en"
	}
}

func (s *SettingsResolver) cacheKey(sc SettingsContext) string {
	b := uuidStr(sc.BranchID)
	t := uuidStr(sc.TerminalID)
	c := uuidStr(sc.CategoryID)
	p := uuidStr(sc.ProductID)
	return fmt.Sprintf("settings:biz:%s:b:%s:t:%s:c:%s:p:%s", sc.BusinessID.String(), b, t, c, p)
}

func uuidStr(id *uuid.UUID) string {
	if id == nil {
		return "none"
	}
	return id.String()
}

// ResolveSettingsHierarchy is a pure function implementing the 6-level priority precedence:
// SYSTEM -> BUSINESS -> BRANCH -> TERMINAL -> CATEGORY -> PRODUCT.
func ResolveSettingsHierarchy(
	defs []db.SettingDefinition,
	overrides []db.ScopedSetting,
	sc SettingsContext,
) []domain.ResolvedSetting {
	// Index overrides by key -> scope_level -> target_id
	byKey := make(map[string][]db.ScopedSetting)
	for _, ov := range overrides {
		byKey[ov.SettingKey] = append(byKey[ov.SettingKey], ov)
	}

	out := make([]domain.ResolvedSetting, 0, len(defs))
	for _, def := range defs {
		res := domain.ResolvedSetting{
			Key:           def.Key,
			Label:         def.Label,
			Category:      def.Category,
			Description:   def.Description,
			ValueType:     def.ValueType,
			EffectiveJSON: string(def.DefaultValue),
			InheritedFrom: "SYSTEM",
			IsOverridden:  false,
		}

		keyOverrides := byKey[def.Key]
		// Walk lowest priority to highest so later matches win cleanly.
		for _, level := range domain.SettingScopeOrder {
			if level == "SYSTEM" {
				for _, ov := range keyOverrides {
					if ov.ScopeLevel == "SYSTEM" {
						res.EffectiveJSON = string(ov.ValueJson)
						res.InheritedFrom = "SYSTEM"
					}
				}
				continue
			}

			expectedTarget := targetForLevel(sc, level)
			for _, ov := range keyOverrides {
				if ov.ScopeLevel != level {
					continue
				}
				if matchesTarget(level, ov.ScopeTargetID, expectedTarget, sc.BusinessID) {
					res.EffectiveJSON = string(ov.ValueJson)
					res.InheritedFrom = level
					if ov.ScopeTargetID.Valid {
						res.ScopeTargetID = ov.ScopeTargetID.UUID.String()
					}
					res.IsOverridden = true
				}
			}
		}
		out = append(out, res)
	}
	return out
}

func targetForLevel(sc SettingsContext, level string) *uuid.UUID {
	switch level {
	case "BUSINESS":
		return &sc.BusinessID
	case "BRANCH":
		return sc.BranchID
	case "TERMINAL":
		return sc.TerminalID
	case "CATEGORY":
		return sc.CategoryID
	case "PRODUCT":
		return sc.ProductID
	default:
		return nil
	}
}

func matchesTarget(level string, rowTarget uuid.NullUUID, expected *uuid.UUID, businessID uuid.UUID) bool {
	if level == "BUSINESS" {
		return !rowTarget.Valid || rowTarget.UUID == businessID
	}
	if expected == nil || *expected == uuid.Nil {
		return false
	}
	return rowTarget.Valid && rowTarget.UUID == *expected
}
