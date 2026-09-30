import { describe, it, expect } from "vitest";
import {
  fieldLabel,
  isValidHolderDid,
  validateCredentialData,
  validateFieldValue,
  type ConstrainedField,
} from "./schemaValidation";

const str = (over: Partial<ConstrainedField> = {}): ConstrainedField => ({
  name: "field",
  type: "string",
  required: false,
  ...over,
});

describe("fieldLabel", () => {
  it("humanizes camelCase, snake_case and kebab-case", () => {
    expect(fieldLabel("studentName")).toBe("Student Name");
    expect(fieldLabel("roll_number")).toBe("Roll number");
    expect(fieldLabel("passport-id")).toBe("Passport id");
  });
});

describe("validateFieldValue — required", () => {
  it("rejects a blank value only when the field is required", () => {
    expect(validateFieldValue(str({ name: "email", required: true }), "")).toBe("Email is required");
    expect(validateFieldValue(str({ name: "email", required: true }), undefined)).toBe("Email is required");
    expect(validateFieldValue(str({ name: "email" }), "")).toBeNull();
  });
});

describe("validateFieldValue — options", () => {
  const field = str({ name: "employmentType", options: ["Full-time", "Part-time"] });

  it("accepts a listed option", () => {
    expect(validateFieldValue(field, "Part-time")).toBeNull();
  });

  it("rejects an unlisted option and lists the allowed set", () => {
    expect(validateFieldValue(field, "Freelance")).toBe(
      "Employment Type must be one of: Full-time, Part-time",
    );
  });

  it("is case-sensitive, matching the stored option strings", () => {
    expect(validateFieldValue(field, "part-time")).not.toBeNull();
  });
});

describe("validateFieldValue — pattern", () => {
  it("accepts a matching value and rejects a non-matching one", () => {
    const field = str({ name: "email", pattern: "^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$" });
    expect(validateFieldValue(field, "ada@blockid.app")).toBeNull();
    expect(validateFieldValue(field, "ada@blockid")).not.toBeNull();
  });

  it("prefers the human hint over the raw regex", () => {
    const field = str({
      name: "email",
      pattern: "^\\d+$",
      hint: "Must be a valid company email",
    });
    expect(validateFieldValue(field, "nope")).toBe("Email: Must be a valid company email");
  });

  it("ignores an unparseable pattern rather than blocking issuance", () => {
    const field = str({ name: "email", pattern: "([unclosed" });
    expect(validateFieldValue(field, "anything")).toBeNull();
  });
});

describe("validateFieldValue — numeric bounds", () => {
  const field = str({ name: "gpa", type: "number", min: 0, max: 4 });

  it("accepts values inside the inclusive range", () => {
    expect(validateFieldValue(field, 0)).toBeNull();
    expect(validateFieldValue(field, 4)).toBeNull();
    expect(validateFieldValue(field, 3.75)).toBeNull();
  });

  it("rejects values outside the range", () => {
    expect(validateFieldValue(field, -1)).toBe("Gpa must be at least 0");
    expect(validateFieldValue(field, 4.5)).toBe("Gpa must be at most 4");
  });

  it("rejects a non-numeric value for a number field", () => {
    expect(validateFieldValue(field, "A+")).toBe("Gpa must be a number");
  });

  it("ignores bounds on non-numeric field types", () => {
    const text = str({ name: "grade", type: "string", min: 0, max: 4 });
    expect(validateFieldValue(text, "A+")).toBeNull();
  });
});

describe("validateCredentialData", () => {
  const fields: ConstrainedField[] = [
    { name: "fullName", type: "string", required: true },
    { name: "employeeId", type: "string", pattern: "^EMP-\\d{4}$" },
    { name: "salary", type: "number", min: 0 },
    { name: "idNumber", type: "string", auto: "id" },
  ];

  it("returns no errors for a fully valid payload", () => {
    expect(
      validateCredentialData(fields, { fullName: "Ada Lovelace", employeeId: "EMP-0042", salary: 120000 }),
    ).toEqual({});
  });

  it("reports every offending field at once", () => {
    const errors = validateCredentialData(fields, { fullName: "", employeeId: "nope", salary: -5 });
    expect(Object.keys(errors).sort()).toEqual(["employeeId", "fullName", "salary"]);
  });

  it("skips server-allocated auto fields entirely", () => {
    expect(validateCredentialData(fields, { fullName: "Ada" })).toEqual({});
  });

  it("tolerates an empty or missing field list and payload", () => {
    expect(validateCredentialData([], { anything: "goes" })).toEqual({});
    expect(validateCredentialData(fields, {})).toHaveProperty("fullName");
  });
});

describe("isValidHolderDid", () => {
  it("accepts a bare 0x address", () => {
    expect(isValidHolderDid("0x1234567890abcdef1234567890abcdef12345678")).toBe(true);
  });

  it("accepts a method-specific DID", () => {
    expect(isValidHolderDid("did:ethr:sepolia:0x1234567890abcdef1234567890abcdef12345678")).toBe(true);
  });

  it("rejects malformed or empty values", () => {
    expect(isValidHolderDid("")).toBe(false);
    expect(isValidHolderDid("0x1234")).toBe(false);
    expect(isValidHolderDid("not-a-did")).toBe(false);
    expect(isValidHolderDid("did:ethr:sepolia:")).toBe(false);
  });
});
