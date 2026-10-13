const { isIP } = require("node:net");

function proxyTrust(env = process.env) {
  const value = (env.TRUST_PROXY || "").trim();
  // Render's public web ingress is one hop. Direct/local servers trust no headers.
  if (!value) return env.RENDER === "true" ? 1 : false;
  if (["0", "false"].includes(value)) return false;
  if (/^[1-5]$/.test(value)) return Number(value);
  const addresses = value.split(",").map(part => part.trim());
  if (addresses.every(address => {
    if (address === "loopback") return true;
    const [ip, prefix, extra] = address.split("/");
    const version = isIP(ip);
    if (!version || extra !== undefined) return false;
    if (prefix === undefined) return true;
    if (!/^\d+$/.test(prefix)) return false;
    const bits = Number(prefix);
    // Keep CIDR trust IPv4-only; explicit IPv6 proxy addresses are allowed above.
    // This avoids ambiguous/mapped IPv6 trust masks in older proxy-addr releases.
    return version === 4 && bits > 0 && bits <= 32;
  })) return addresses;
  throw new Error("TRUST_PROXY must be 0, 1–5 trusted hops, loopback, explicit trusted IP addresses or IPv4 subnets. Never trust every forwarded header.");
}
module.exports = { proxyTrust };
