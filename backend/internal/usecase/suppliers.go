package usecase

import (
	"context"
	"errors"
	"strings"

	"github.com/enterprise-pos/backend/internal/repository/sqlc/db"
	"github.com/google/uuid"
)

// SaveSupplierRequest carries payload for creating or updating a vendor/supplier.
type SaveSupplierRequest struct {
	Code             string `json:"code"`
	Name             string `json:"name"`
	Email            string `json:"email"`
	Phone            string `json:"phone"`
	TaxID            string `json:"tax_id"`
	PaymentTermsDays int32  `json:"payment_terms_days"`
}

// ListSuppliers returns tenant-isolated suppliers with PO/GRN/invoice and open AP counts.
func (c *CatalogCompanyUsecase) ListSuppliers(ctx context.Context, businessID uuid.UUID) ([]db.ListSuppliersDetailedRow, error) {
	return c.queries.ListSuppliersDetailed(ctx, businessID)
}

// CreateSupplier adds a supplier/vendor record under the active business tenant.
func (c *CatalogCompanyUsecase) CreateSupplier(ctx context.Context, businessID uuid.UUID, req SaveSupplierRequest) (db.Supplier, error) {
	name := strings.TrimSpace(req.Name)
	if name == "" {
		return db.Supplier{}, errors.New("supplier name is required")
	}

	code := strings.ToUpper(strings.TrimSpace(req.Code))
	if code == "" {
		code = "SUP-" + strings.ToUpper(uuid.NewString()[:6])
	}

	terms := req.PaymentTermsDays
	if terms <= 0 {
		terms = 30
	}

	row, err := c.queries.CreateSupplier(ctx, db.CreateSupplierParams{
		BusinessID:       businessID,
		Code:             code,
		Name:             name,
		Email:            strings.TrimSpace(req.Email),
		Phone:            normalizePhoneNumber(req.Phone),
		TaxID:            strings.ToUpper(strings.TrimSpace(req.TaxID)),
		PaymentTermsDays: terms,
	})
	if err != nil {
		if strings.Contains(err.Error(), "duplicate key") || strings.Contains(err.Error(), "unique") {
			return db.Supplier{}, errors.New("supplier code already exists for this business")
		}
		return db.Supplier{}, err
	}
	return row, nil
}

// UpdateSupplier updates an existing supplier/vendor scoped by business_id.
func (c *CatalogCompanyUsecase) UpdateSupplier(ctx context.Context, businessID, supplierID uuid.UUID, req SaveSupplierRequest) (db.Supplier, error) {
	if supplierID == uuid.Nil {
		return db.Supplier{}, errors.New("supplier id is required")
	}
	existing, err := c.queries.GetSupplierByID(ctx, db.GetSupplierByIDParams{
		BusinessID: businessID,
		ID:         supplierID,
	})
	if err != nil {
		return db.Supplier{}, errors.New("supplier not found")
	}

	name := strings.TrimSpace(req.Name)
	if name == "" {
		return db.Supplier{}, errors.New("supplier name is required")
	}

	code := strings.ToUpper(strings.TrimSpace(req.Code))
	if code == "" {
		code = existing.Code
	}

	terms := req.PaymentTermsDays
	if terms <= 0 {
		terms = existing.PaymentTermsDays
		if terms <= 0 {
			terms = 30
		}
	}

	row, err := c.queries.UpdateSupplier(ctx, db.UpdateSupplierParams{
		BusinessID:       businessID,
		ID:               supplierID,
		Code:             code,
		Name:             name,
		Email:            strings.TrimSpace(req.Email),
		Phone:            normalizePhoneNumber(req.Phone),
		TaxID:            strings.ToUpper(strings.TrimSpace(req.TaxID)),
		PaymentTermsDays: terms,
	})
	if err != nil {
		if strings.Contains(err.Error(), "duplicate key") || strings.Contains(err.Error(), "unique") {
			return db.Supplier{}, errors.New("supplier code already exists for this business")
		}
		return db.Supplier{}, err
	}
	return row, nil
}

// DeleteSupplier removes a supplier only when not linked to purchase orders, GRNs, or vendor invoices.
func (c *CatalogCompanyUsecase) DeleteSupplier(ctx context.Context, businessID, supplierID uuid.UUID) error {
	if supplierID == uuid.Nil {
		return errors.New("supplier id is required")
	}
	if _, err := c.queries.GetSupplierByID(ctx, db.GetSupplierByIDParams{
		BusinessID: businessID,
		ID:         supplierID,
	}); err != nil {
		return errors.New("supplier not found")
	}

	usage, err := c.queries.CheckSupplierUsage(ctx, db.CheckSupplierUsageParams{
		BusinessID: businessID,
		SupplierID: supplierID,
	})
	if err != nil {
		return err
	}
	if usage > 0 {
		return errors.New("supplier cannot be deleted because it has linked purchase orders, GRNs, or vendor invoices")
	}

	return c.queries.DeleteSupplier(ctx, db.DeleteSupplierParams{
		BusinessID: businessID,
		ID:         supplierID,
	})
}

