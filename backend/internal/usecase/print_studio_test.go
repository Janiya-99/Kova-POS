package usecase

import (
	"encoding/json"
	"testing"

	"github.com/shopspring/decimal"
)

func TestNormalizePrintTemplateInput(t *testing.T) {
	t.Run("accepts valid 80mm thermal template and clamps snap grid", func(t *testing.T) {
		name, docType, w, h, snap, canvas, profile, err := normalizePrintTemplateInput(SavePrintTemplateRequest{
			Name:           "  Counter 80mm  ",
			DocumentType:   "thermal_80mm",
			PaperWidthMm:   decimal.Zero,
			PaperHeightMm:  decimal.Zero,
			SnapGridMm:     decimal.NewFromInt(50),
			CanvasSchema:   json.RawMessage(`{"version":1,"blocks":[]}`),
			PrinterProfile: json.RawMessage(`{"transport":"webusb"}`),
		})
		if err != nil {
			t.Fatalf("expected valid input, got error: %v", err)
		}
		if name != "Counter 80mm" || docType != "THERMAL_80MM" {
			t.Fatalf("unexpected normalization: name=%q docType=%q", name, docType)
		}
		if !w.Equal(decimal.NewFromInt(80)) || !h.Equal(decimal.NewFromInt(210)) {
			t.Fatalf("expected default 80x210mm bounds, got %sx%s", w, h)
		}
		if !snap.Equal(decimal.NewFromInt(2)) {
			t.Fatalf("expected clamped thermal snap grid 2mm, got %s", snap)
		}
		if !json.Valid(canvas) || !json.Valid(profile) {
			t.Fatalf("expected valid JSON output")
		}
	})

	t.Run("rejects unsupported document type", func(t *testing.T) {
		_, _, _, _, _, _, _, err := normalizePrintTemplateInput(SavePrintTemplateRequest{
			Name:         "Letter Layout",
			DocumentType: "LETTER_US",
			CanvasSchema: json.RawMessage(`{}`),
		})
		if err == nil {
			t.Fatalf("expected error for unsupported document type")
		}
	})

	t.Run("rejects malformed canvas JSON", func(t *testing.T) {
		_, _, _, _, _, _, _, err := normalizePrintTemplateInput(SavePrintTemplateRequest{
			Name:         "Broken Canvas",
			DocumentType: "A4_INVOICE",
			CanvasSchema: json.RawMessage(`{"blocks": [}`),
		})
		if err == nil {
			t.Fatalf("expected error for malformed canvas JSON")
		}
	})
}

