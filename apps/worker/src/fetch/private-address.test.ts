import { describe, it, expect } from "vitest";
import { isPrivateAddress } from "./private-address.js";

describe("isPrivateAddress", () => {
  it("flags IPv4 loopback", () => {
    expect(isPrivateAddress("127.0.0.1")).toBe(true);
    expect(isPrivateAddress("127.5.6.7")).toBe(true);
  });

  it("flags IPv4 private ranges", () => {
    expect(isPrivateAddress("10.0.0.1")).toBe(true);
    expect(isPrivateAddress("172.16.0.1")).toBe(true);
    expect(isPrivateAddress("172.31.255.255")).toBe(true);
    expect(isPrivateAddress("192.168.1.1")).toBe(true);
  });

  it("flags IPv4 link-local incl cloud metadata", () => {
    expect(isPrivateAddress("169.254.0.1")).toBe(true);
    expect(isPrivateAddress("169.254.169.254")).toBe(true);
  });

  it("flags IPv4 unspecified / this-network", () => {
    expect(isPrivateAddress("0.0.0.0")).toBe(true);
  });

  it("allows public IPv4", () => {
    expect(isPrivateAddress("8.8.8.8")).toBe(false);
    expect(isPrivateAddress("1.1.1.1")).toBe(false);
    expect(isPrivateAddress("172.32.0.1")).toBe(false);
    expect(isPrivateAddress("93.184.216.34")).toBe(false);
  });

  it("flags IPv6 loopback and unspecified", () => {
    expect(isPrivateAddress("::1")).toBe(true);
    expect(isPrivateAddress("::")).toBe(true);
  });

  it("flags IPv6 unique-local (fc00::/7)", () => {
    expect(isPrivateAddress("fc00::1")).toBe(true);
    expect(isPrivateAddress("fd12:3456::1")).toBe(true);
  });

  it("flags IPv6 link-local (fe80::/10)", () => {
    expect(isPrivateAddress("fe80::1")).toBe(true);
  });

  it("flags IPv4-mapped IPv6 pointing at private v4", () => {
    expect(isPrivateAddress("::ffff:127.0.0.1")).toBe(true);
    expect(isPrivateAddress("::ffff:169.254.169.254")).toBe(true);
  });

  it("allows public IPv6", () => {
    expect(isPrivateAddress("2606:4700:4700::1111")).toBe(false);
  });
});
