// Block credentials with context, not ordinary dates, course numbers or error IDs.
export const supportSecretPattern = /\b(?:sk-[a-z0-9_-]{8,}|AIza[a-z0-9_-]{12,}|Bearer\s+\S+)|^\s*\d{4,8}\s*$|(?:password|passwd|api[ _-]?key|密码|密钥)\s*(?:is|是|为|[:=：])\s*\S+|(?:verification[ _-]?code|one[ -]time[ -]code|otp|验证码)\s*(?:(?:is|是|为|[:=：])\s*)?\d{4,8}\b|\bcode\s*(?:is|[:=])\s*\d{4,8}\b/i;
export const containsSupportSecret = text => supportSecretPattern.test(text);
