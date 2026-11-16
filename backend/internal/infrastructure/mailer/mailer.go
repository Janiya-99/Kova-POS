package mailer

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/tls"
	"encoding/hex"
	"errors"
	"fmt"
	"html"
	"net"
	"net/mail"
	"net/smtp"
	"net/url"
	"strings"
	"time"
)

// Config holds SMTP relay parameters and the public frontend URL used in email links.
type Config struct {
	Host       string
	Port       string
	User       string
	Password   string
	From       string
	AppBaseURL string
}

// PasswordResetEmailInput carries the personalized fields needed to dispatch a KOVA POS reset email.
type PasswordResetEmailInput struct {
	ToEmail          string
	FullName         string
	CompanySlug      string
	Code             string
	ResetToken       string
	ExpiresInMinutes int
}

// Mailer delivers transactional emails over SMTP (TLS 465, STARTTLS 587, or local plain relays).
type Mailer struct {
	cfg Config
}

// New constructs a Mailer with normalized defaults.
func New(cfg Config) *Mailer {
	port := strings.TrimSpace(cfg.Port)
	if port == "" {
		port = "587"
	}
	from := strings.TrimSpace(cfg.From)
	if from == "" {
		if strings.Contains(cfg.User, "@") {
			from = "KOVA POS <" + strings.TrimSpace(cfg.User) + ">"
		} else {
			from = "KOVA POS <no-reply@kovapos.local>"
		}
	}
	baseURL := strings.TrimRight(strings.TrimSpace(cfg.AppBaseURL), "/")
	if baseURL == "" {
		baseURL = "http://localhost:5173"
	}
	cfg.Host = strings.TrimSpace(cfg.Host)
	cfg.Port = port
	cfg.User = strings.TrimSpace(cfg.User)
	cfg.From = from
	cfg.AppBaseURL = baseURL
	return &Mailer{cfg: cfg}
}

// IsConfigured reports whether an SMTP host is configured for outbound email delivery.
func (m *Mailer) IsConfigured() bool {
	return m != nil && strings.TrimSpace(m.cfg.Host) != ""
}

// BuildResetURL constructs the direct frontend login URL that pre-opens the password reset verification modal.
func (m *Mailer) BuildResetURL(email, companySlug, resetToken string) string {
	base := "http://localhost:5173"
	if m != nil && m.cfg.AppBaseURL != "" {
		base = m.cfg.AppBaseURL
	}
	loginPath := "/login"
	if cleanSlug := strings.TrimSpace(companySlug); cleanSlug != "" {
		loginPath = "/c/" + url.PathEscape(cleanSlug) + "/login"
	}
	q := url.Values{}
	q.Set("reset_token", resetToken)
	q.Set("email", strings.TrimSpace(email))
	return base + loginPath + "?" + q.Encode()
}

// SendPasswordResetEmail formats and sends a multipart plain+HTML reset verification email via SMTP.
func (m *Mailer) SendPasswordResetEmail(ctx context.Context, in PasswordResetEmailInput) error {
	if !m.IsConfigured() {
		return errors.New("email service is not configured: set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, and SMTP_FROM in .env")
	}

	toAddr, err := parseEnvelopeEmail(in.ToEmail)
	if err != nil {
		return fmt.Errorf("invalid recipient email: %w", err)
	}
	fromParsed, err := mail.ParseAddress(sanitizeHeader(m.cfg.From))
	if err != nil {
		return fmt.Errorf("invalid SMTP_FROM address: %w", err)
	}

	expiryMin := in.ExpiresInMinutes
	if expiryMin <= 0 {
		expiryMin = 15
	}
	recipientName := strings.TrimSpace(in.FullName)
	if recipientName == "" {
		recipientName = "Team Member"
	}
	resetURL := m.BuildResetURL(toAddr, in.CompanySlug, in.ResetToken)

	subject := fmt.Sprintf("KOVA POS Password Reset Code: %s", sanitizeHeader(in.Code))
	payload, err := buildResetEmailMIME(fromParsed.String(), toAddr, subject, recipientName, in.Code, resetURL, expiryMin)
	if err != nil {
		return err
	}

	return m.sendSMTP(ctx, fromParsed.Address, toAddr, payload)
}

func (m *Mailer) sendSMTP(ctx context.Context, fromAddr, toAddr string, message []byte) error {
	host := m.cfg.Host
	port := m.cfg.Port
	addr := net.JoinHostPort(host, port)

	dialer := net.Dialer{Timeout: 10 * time.Second}
	var conn net.Conn
	var err error
	if port == "465" {
		tlsDialer := &tls.Dialer{
			NetDialer: &dialer,
			Config:    &tls.Config{ServerName: host, MinVersion: tls.VersionTLS12},
		}
		conn, err = tlsDialer.DialContext(ctx, "tcp", addr)
	} else {
		conn, err = dialer.DialContext(ctx, "tcp", addr)
	}
	if err != nil {
		return fmt.Errorf("connect smtp server %s: %w", addr, err)
	}
	if dl, ok := ctx.Deadline(); ok {
		_ = conn.SetDeadline(dl)
	}

	client, err := smtp.NewClient(conn, host)
	if err != nil {
		_ = conn.Close()
		return fmt.Errorf("initialize smtp client: %w", err)
	}
	defer func() { _ = client.Close() }()

	if port != "465" {
		if ok, _ := client.Extension("STARTTLS"); ok {
			if err := client.StartTLS(&tls.Config{ServerName: host, MinVersion: tls.VersionTLS12}); err != nil {
				return fmt.Errorf("smtp starttls failed: %w", err)
			}
		}
	}

	if m.cfg.User != "" {
		if ok, _ := client.Extension("AUTH"); ok {
			auth := smtp.PlainAuth("", m.cfg.User, m.cfg.Password, host)
			if err := client.Auth(auth); err != nil {
				return fmt.Errorf("smtp authentication failed: %w", err)
			}
		}
	}

	if err := client.Mail(fromAddr); err != nil {
		return fmt.Errorf("smtp MAIL FROM failed: %w", err)
	}
	if err := client.Rcpt(toAddr); err != nil {
		return fmt.Errorf("smtp RCPT TO failed: %w", err)
	}
	wc, err := client.Data()
	if err != nil {
		return fmt.Errorf("smtp DATA failed: %w", err)
	}
	if _, err := wc.Write(message); err != nil {
		_ = wc.Close()
		return fmt.Errorf("write smtp body failed: %w", err)
	}
	if err := wc.Close(); err != nil {
		return fmt.Errorf("finalize smtp message: %w", err)
	}
	return client.Quit()
}

func buildResetEmailMIME(fromHeader, toAddr, subject, fullName, code, resetURL string, expiryMinutes int) ([]byte, error) {
	boundaryBytes := make([]byte, 12)
	if _, err := rand.Read(boundaryBytes); err != nil {
		return nil, err
	}
	boundary := "kova-pos-" + hex.EncodeToString(boundaryBytes)

	plainText := fmt.Sprintf(
		"Hello %s,\r\n\r\n"+
			"Use the 6-digit verification code below to reset your KOVA POS password:\r\n\r\n"+
			"    %s\r\n\r\n"+
			"Or open this direct reset link:\r\n%s\r\n\r\n"+
			"This code expires in %d minutes. If you did not request a password reset, you can safely ignore this email.\r\n\r\n"+
			"— KOVA POS Security\r\n",
		fullName, code, resetURL, expiryMinutes,
	)

	escName := html.EscapeString(fullName)
	escCode := html.EscapeString(code)
	escURL := html.EscapeString(resetURL)

	htmlBody := fmt.Sprintf(`<!doctype html>
<html>
<body style="margin:0;padding:24px;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#111827;">
  <table role="presentation" width="100%%" cellspacing="0" cellpadding="0" style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:18px;overflow:hidden;">
    <tr>
      <td style="padding:24px 28px;background:#14171d;color:#ffffff;">
        <div style="font-size:18px;font-weight:800;letter-spacing:-0.02em;">KOVA <span style="display:inline-block;padding:2px 7px;border-radius:6px;background:#10b981;color:#081c15;font-size:11px;font-weight:800;vertical-align:middle;">POS</span></div>
        <div style="margin-top:6px;font-size:13px;color:#cbd5e1;">Password Reset Verification</div>
      </td>
    </tr>
    <tr>
      <td style="padding:28px;">
        <p style="margin:0 0 14px;font-size:14px;line-height:1.5;">Hello <strong>%s</strong>,</p>
        <p style="margin:0 0 18px;font-size:14px;line-height:1.5;color:#374151;">Enter this 6-digit verification code in the KOVA POS password reset screen, or use the direct button below:</p>
        <div style="margin:0 0 20px;padding:16px;border-radius:12px;background:#f8fafc;border:1px solid #e2e8f0;text-align:center;">
          <div style="font-size:28px;font-weight:800;letter-spacing:0.28em;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;color:#0f172a;">%s</div>
          <div style="margin-top:6px;font-size:12px;color:#64748b;">Expires in %d minutes</div>
        </div>
        <div style="text-align:center;margin:0 0 22px;">
          <a href="%s" style="display:inline-block;padding:12px 22px;border-radius:10px;background:#14171d;color:#ffffff;text-decoration:none;font-size:13px;font-weight:700;">Reset Password Directly</a>
        </div>
        <p style="margin:0;font-size:12px;line-height:1.5;color:#6b7280;">If you did not request a password reset, no changes have been made to your account and you can safely ignore this email.</p>
      </td>
    </tr>
  </table>
</body>
</html>`, escName, escCode, expiryMinutes, escURL)

	var buf bytes.Buffer
	buf.WriteString("From: " + sanitizeHeader(fromHeader) + "\r\n")
	buf.WriteString("To: " + sanitizeHeader(toAddr) + "\r\n")
	buf.WriteString("Subject: " + sanitizeHeader(subject) + "\r\n")
	buf.WriteString("MIME-Version: 1.0\r\n")
	buf.WriteString("Date: " + time.Now().UTC().Format(time.RFC1123Z) + "\r\n")
	buf.WriteString(fmt.Sprintf("Content-Type: multipart/alternative; boundary=%q\r\n", boundary))
	buf.WriteString("\r\n")

	buf.WriteString("--" + boundary + "\r\n")
	buf.WriteString("Content-Type: text/plain; charset=UTF-8\r\n")
	buf.WriteString("Content-Transfer-Encoding: 8bit\r\n\r\n")
	buf.WriteString(plainText + "\r\n")

	buf.WriteString("--" + boundary + "\r\n")
	buf.WriteString("Content-Type: text/html; charset=UTF-8\r\n")
	buf.WriteString("Content-Transfer-Encoding: 8bit\r\n\r\n")
	buf.WriteString(htmlBody + "\r\n")

	buf.WriteString("--" + boundary + "--\r\n")
	return buf.Bytes(), nil
}

func parseEnvelopeEmail(raw string) (string, error) {
	parsed, err := mail.ParseAddress(strings.TrimSpace(raw))
	if err != nil {
		return "", err
	}
	return strings.ToLower(strings.TrimSpace(parsed.Address)), nil
}

func sanitizeHeader(v string) string {
	v = strings.ReplaceAll(v, "\r", "")
	v = strings.ReplaceAll(v, "\n", "")
	return strings.TrimSpace(v)
}

