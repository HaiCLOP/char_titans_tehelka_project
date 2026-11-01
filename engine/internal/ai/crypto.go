package ai

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"strings"
)

// Same format as src/lib/ai/crypto.ts: AES-256-GCM, key = sha256(AI_KEYS_SECRET),
// payload = base64(iv) "." base64(tag) "." base64(ciphertext), 12-byte IV, 16-byte tag.
// touch nako karna gois

func gcmFor(secret string) (cipher.AEAD, error) {
	if secret == "" {
		return nil, errors.New("AI_KEYS_SECRET missing")
	}
	k := sha256.Sum256([]byte(secret))
	block, err := aes.NewCipher(k[:])
	if err != nil {
		return nil, err
	}
	return cipher.NewGCM(block)
}

// DecryptKey decrypts a value produced by encryptKey() in the Node app.
func DecryptKey(secret, payload string) (string, error) {
	parts := strings.Split(payload, ".")
	if len(parts) != 3 {
		return "", errors.New("bad payload format")
	}
	var raw [3][]byte
	for i, p := range parts {
		b, err := base64.StdEncoding.DecodeString(p)
		if err != nil {
			return "", errors.New("bad base64 in payload")
		}
		raw[i] = b
	}
	iv, tag, enc := raw[0], raw[1], raw[2]
	if len(iv) != 12 || len(tag) != 16 {
		return "", errors.New("bad iv/tag length")
	}
	g, err := gcmFor(secret)
	if err != nil {
		return "", err
	}
	plain, err := g.Open(nil, iv, append(append([]byte{}, enc...), tag...), nil)
	if err != nil {
		return "", errors.New("decryption failed")
	}
	return string(plain), nil
}

// EncryptKey is the inverse (used by tests; compatible with the Node decryptKey).
func EncryptKey(secret, plain string) (string, error) {
	g, err := gcmFor(secret)
	if err != nil {
		return "", err
	}
	iv := make([]byte, 12)
	if _, err := rand.Read(iv); err != nil {
		return "", err
	}
	sealed := g.Seal(nil, iv, []byte(plain), nil)
	enc, tag := sealed[:len(sealed)-16], sealed[len(sealed)-16:]
	b := base64.StdEncoding.EncodeToString
	return b(iv) + "." + b(tag) + "." + b(enc), nil
}
