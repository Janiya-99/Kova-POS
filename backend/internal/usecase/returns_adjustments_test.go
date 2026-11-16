package usecase

import "testing"

func TestNormalizeAdjustmentTypeAndDisposition(t *testing.T) {
	tests := []struct {
		rawType        string
		rawDisp        string
		wantType       string
		wantPrefix     string
		wantDisp       string
		wantResStatus  string
		wantErr        bool
	}{
		{"damage", "", "DAMAGE", "DMG", "WRITE_OFF_SCRAP", "SCRAPPED", false},
		{"WASTAGE", "QUARANTINE_DAMAGED", "WASTAGE", "WST", "QUARANTINE_DAMAGED", "QUARANTINE", false},
		{"expiry_writeoff", "", "EXPIRY_WRITEOFF", "EXP", "WRITE_OFF_SCRAP", "SCRAPPED", false},
		{"rma", "", "SUPPLIER_RETURN", "RMA", "RETURN_TO_SUPPLIER", "RMA_SENT", false},
		{"INVALID", "", "", "", "", "", true},
	}

	for _, tc := range tests {
		gotType, gotPrefix, err := normalizeAdjustmentType(tc.rawType)
		if tc.wantErr {
			if err == nil {
				t.Fatalf("expected error for %q", tc.rawType)
			}
			continue
		}
		if err != nil {
			t.Fatalf("unexpected error for %q: %v", tc.rawType, err)
		}
		if gotType != tc.wantType || gotPrefix != tc.wantPrefix {
			t.Fatalf("normalizeAdjustmentType(%q) = (%s, %s), want (%s, %s)", tc.rawType, gotType, gotPrefix, tc.wantType, tc.wantPrefix)
		}
		gotDisp, gotStatus := normalizeAdjustmentDisposition(gotType, tc.rawDisp)
		if gotDisp != tc.wantDisp || gotStatus != tc.wantResStatus {
			t.Fatalf("normalizeAdjustmentDisposition(%s, %q) = (%s, %s), want (%s, %s)", gotType, tc.rawDisp, gotDisp, gotStatus, tc.wantDisp, tc.wantResStatus)
		}
	}
}

func TestNormalizePOSReturnDisposition(t *testing.T) {
	d, st := normalizePOSReturnDisposition("QUARANTINE_DAMAGED")
	if d != "QUARANTINE_DAMAGED" || st != "QUARANTINE" {
		t.Fatalf("unexpected damaged mapping: %s / %s", d, st)
	}
	d, st = normalizePOSReturnDisposition("WRITE_OFF_SCRAP")
	if d != "WRITE_OFF_SCRAP" || st != "SCRAPPED" {
		t.Fatalf("unexpected scrap mapping: %s / %s", d, st)
	}
	d, st = normalizePOSReturnDisposition("")
	if d != "RESTOCK_SELLABLE" || st != "COMPLETED" {
		t.Fatalf("unexpected default restock mapping: %s / %s", d, st)
	}
}

