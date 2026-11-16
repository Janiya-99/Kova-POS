package usecase

import (
	"sort"
	"strings"

	"github.com/enterprise-pos/backend/internal/domain"
	"github.com/shopspring/decimal"
)

var hundred = decimal.NewFromInt(100)

// CalculateMultiTierTaxes computes inclusive, exclusive, and compound tax-on-tax lines
// using exact shopspring/decimal arithmetic and the configured rounding mode.
func CalculateMultiTierTaxes(
	baseAmount decimal.Decimal,
	rules []domain.TaxRuleSpec,
	roundingMode string,
) domain.TaxCalculationResult {
	if len(rules) == 0 || baseAmount.LessThanOrEqual(decimal.Zero) {
		return domain.TaxCalculationResult{
			NetAmount:   roundCurrency(baseAmount, roundingMode),
			TotalTax:    decimal.Zero,
			GrossAmount: roundCurrency(baseAmount, roundingMode),
			Lines:       []domain.TaxLineResult{},
		}
	}

	sorted := make([]domain.TaxRuleSpec, len(rules))
	copy(sorted, rules)
	sort.SliceStable(sorted, func(i, j int) bool {
		if sorted[i].Priority == sorted[j].Priority {
			return sorted[i].Code < sorted[j].Code
		}
		return sorted[i].Priority < sorted[j].Priority
	})

	var inclusiveRules, exclusiveAndCompound []domain.TaxRuleSpec
	for _, r := range sorted {
		if strings.EqualFold(r.TaxType, "INCLUSIVE") {
			inclusiveRules = append(inclusiveRules, r)
		} else {
			exclusiveAndCompound = append(exclusiveAndCompound, r)
		}
	}

	lines := make([]domain.TaxLineResult, 0, len(sorted))
	netAmount := baseAmount
	totalTax := decimal.Zero

	// Step 1: Back-calculate any tax-inclusive rules from the shelf base amount.
	if len(inclusiveRules) > 0 {
		sumRates := decimal.Zero
		for _, r := range inclusiveRules {
			sumRates = sumRates.Add(r.RatePercent.Div(hundred))
		}
		divisor := decimal.NewFromInt(1).Add(sumRates)
		if divisor.GreaterThan(decimal.Zero) {
			netAmount = roundCurrency(baseAmount.Div(divisor), roundingMode)
		}
		for _, r := range inclusiveRules {
			taxAmt := roundCurrency(netAmount.Mul(r.RatePercent).Div(hundred), roundingMode)
			totalTax = totalTax.Add(taxAmt)
			lines = append(lines, domain.TaxLineResult{
				RuleID:      r.RuleID,
				Code:        r.Code,
				Name:        r.Name,
				TaxType:     "INCLUSIVE",
				RatePercent: r.RatePercent,
				TaxableBase: netAmount,
				TaxAmount:   taxAmt,
			})
		}
	}

	// Step 2: Apply EXCLUSIVE rules on netAmount, and COMPOUND rules on (netAmount + prior taxes).
	runningExclusiveTax := decimal.Zero
	for _, r := range exclusiveAndCompound {
		taxableBase := netAmount
		if strings.EqualFold(r.TaxType, "COMPOUND") {
			taxableBase = netAmount.Add(totalTax)
		}
		taxAmt := roundCurrency(taxableBase.Mul(r.RatePercent).Div(hundred), roundingMode)
		runningExclusiveTax = runningExclusiveTax.Add(taxAmt)
		totalTax = totalTax.Add(taxAmt)
		lines = append(lines, domain.TaxLineResult{
			RuleID:      r.RuleID,
			Code:        r.Code,
			Name:        r.Name,
			TaxType:     strings.ToUpper(r.TaxType),
			RatePercent: r.RatePercent,
			TaxableBase: taxableBase,
			TaxAmount:   taxAmt,
		})
	}

	grossAmount := roundCurrency(netAmount.Add(totalTax), roundingMode)
	return domain.TaxCalculationResult{
		NetAmount:   roundCurrency(netAmount, roundingMode),
		TotalTax:    roundCurrency(totalTax, roundingMode),
		GrossAmount: grossAmount,
		Lines:       lines,
	}
}

func roundCurrency(val decimal.Decimal, mode string) decimal.Decimal {
	switch strings.ToUpper(strings.TrimSpace(mode)) {
	case "HALF_EVEN":
		return val.RoundBank(2)
	case "FLOOR":
		return val.RoundFloor(2)
	case "CEIL":
		return val.RoundCeil(2)
	default:
		return val.Round(2)
	}
}

