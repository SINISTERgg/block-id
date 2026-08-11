import type { SchemaFieldDef } from "@/services/api/issuer.service";

/**
 * Pre-configured W3C Verifiable Credential schema templates.
 * Each template provides standard fields for common credential types.
 * All templates are free to use and follow W3C VC Data Model standards.
 */

export interface SchemaTemplate {
  id: string;
  name: string;
  credentialType: string;
  description: string;
  icon: string; // lucide icon name
  category: "education" | "employment" | "identity" | "certification" | "event";
  fields: SchemaFieldDef[];
}

export const SCHEMA_TEMPLATES: SchemaTemplate[] = [
  // ─── Education ──────────────────────────────────────────────────────
  {
    id: "university-degree",
    name: "University Degree",
    credentialType: "degree",
    description: "Bachelor's, Master's, or Doctoral degree credential",
    icon: "GraduationCap",
    category: "education",
    fields: [
      { name: "studentName", type: "string", required: true },
      { name: "universityName", type: "string", required: true },
      { name: "degreeName", type: "string", required: true },
      { name: "major", type: "string", required: true },
      { name: "graduationDate", type: "date", required: true },
      { name: "gpa", type: "number", required: false },
      { name: "honors", type: "string", required: false },
      { name: "registrationNumber", type: "string", required: true },
    ],
  },
  {
    id: "academic-transcript",
    name: "Academic Transcript",
    credentialType: "transcript",
    description: "Official academic transcript with course records",
    icon: "FileText",
    category: "education",
    fields: [
      { name: "studentName", type: "string", required: true },
      { name: "universityName", type: "string", required: true },
      { name: "programName", type: "string", required: true },
      { name: "enrollmentYear", type: "number", required: true },
      { name: "totalCredits", type: "number", required: true },
      { name: "cumulativeGPA", type: "number", required: true },
      { name: "academicStanding", type: "string", required: false },
    ],
  },
  {
    id: "course-completion",
    name: "Course Completion Certificate",
    credentialType: "certificate",
    description: "Certificate for completing a specific course or program",
    icon: "BookOpen",
    category: "education",
    fields: [
      { name: "participantName", type: "string", required: true },
      { name: "courseName", type: "string", required: true },
      { name: "institutionName", type: "string", required: true },
      { name: "completionDate", type: "date", required: true },
      { name: "grade", type: "string", required: false },
      { name: "durationHours", type: "number", required: false },
    ],
  },

  // ─── Employment ─────────────────────────────────────────────────────
  {
    id: "employment-verification",
    name: "Employment Verification",
    credentialType: "certificate",
    description: "Proof of employment at an organization",
    icon: "Briefcase",
    category: "employment",
    fields: [
      { name: "employeeName", type: "string", required: true },
      { name: "organizationName", type: "string", required: true },
      { name: "jobTitle", type: "string", required: true },
      { name: "department", type: "string", required: false },
      { name: "startDate", type: "date", required: true },
      { name: "endDate", type: "date", required: false },
      { name: "employmentType", type: "string", required: true },
    ],
  },
  {
    id: "internship-certificate",
    name: "Internship Certificate",
    credentialType: "certificate",
    description: "Certificate for completing an internship program",
    icon: "Building2",
    category: "employment",
    fields: [
      { name: "internName", type: "string", required: true },
      { name: "companyName", type: "string", required: true },
      { name: "role", type: "string", required: true },
      { name: "startDate", type: "date", required: true },
      { name: "endDate", type: "date", required: true },
      { name: "supervisorName", type: "string", required: false },
      { name: "projectDescription", type: "text", required: false },
    ],
  },

  // ─── Identity ───────────────────────────────────────────────────────
  {
    id: "national-id",
    name: "National Identity Card",
    credentialType: "certificate",
    description: "Government-issued national identity credential",
    icon: "IdCard",
    category: "identity",
    fields: [
      { name: "fullName", type: "string", required: true },
      { name: "dateOfBirth", type: "date", required: true },
      { name: "nationality", type: "string", required: true },
      { name: "idNumber", type: "string", required: true },
      { name: "gender", type: "string", required: false },
      { name: "address", type: "text", required: false },
      { name: "expiryDate", type: "date", required: true },
    ],
  },
  {
    id: "age-verification",
    name: "Age Verification",
    credentialType: "certificate",
    description: "Verifiable proof of age (suitable for ZK proofs)",
    icon: "UserCheck",
    category: "identity",
    fields: [
      { name: "holderName", type: "string", required: true },
      { name: "dateOfBirth", type: "date", required: true },
      { name: "isOver18", type: "boolean", required: true },
      { name: "isOver21", type: "boolean", required: false },
      { name: "verificationAuthority", type: "string", required: true },
    ],
  },

  // ─── Certification ──────────────────────────────────────────────────
  {
    id: "professional-license",
    name: "Professional License",
    credentialType: "certificate",
    description: "Licensed professional credential (medical, legal, engineering)",
    icon: "Award",
    category: "certification",
    fields: [
      { name: "licenseName", type: "string", required: true },
      { name: "licenseNumber", type: "string", required: true },
      { name: "holderName", type: "string", required: true },
      { name: "issuingAuthority", type: "string", required: true },
      { name: "specialty", type: "string", required: false },
      { name: "issueDate", type: "date", required: true },
      { name: "expiryDate", type: "date", required: true },
    ],
  },
  {
    id: "skill-certification",
    name: "Skill Certification",
    credentialType: "certificate",
    description: "Technical or professional skill certification",
    icon: "BadgeCheck",
    category: "certification",
    fields: [
      { name: "candidateName", type: "string", required: true },
      { name: "certificationName", type: "string", required: true },
      { name: "certifyingBody", type: "string", required: true },
      { name: "skillLevel", type: "string", required: true },
      { name: "issueDate", type: "date", required: true },
      { name: "expiryDate", type: "date", required: false },
      { name: "credentialId", type: "string", required: false },
    ],
  },

  // ─── Events ─────────────────────────────────────────────────────────
  {
    id: "event-attendance",
    name: "Event Attendance",
    credentialType: "certificate",
    description: "Conference, hackathon, or workshop attendance proof",
    icon: "CalendarCheck",
    category: "event",
    fields: [
      { name: "attendeeName", type: "string", required: true },
      { name: "eventName", type: "string", required: true },
      { name: "organizerName", type: "string", required: true },
      { name: "eventDate", type: "date", required: true },
      { name: "eventLocation", type: "string", required: false },
      { name: "role", type: "string", required: false },
    ],
  },
  {
    id: "hackathon-winner",
    name: "Hackathon Achievement",
    credentialType: "certificate",
    description: "Hackathon participation or winning credential",
    icon: "Trophy",
    category: "event",
    fields: [
      { name: "participantName", type: "string", required: true },
      { name: "hackathonName", type: "string", required: true },
      { name: "projectName", type: "string", required: true },
      { name: "placement", type: "string", required: true },
      { name: "eventDate", type: "date", required: true },
      { name: "teamName", type: "string", required: false },
    ],
  },
];

/**
 * Get templates filtered by category.
 */
export function getTemplatesByCategory(category: SchemaTemplate["category"]): SchemaTemplate[] {
  return SCHEMA_TEMPLATES.filter((t) => t.category === category);
}

/**
 * Get a single template by ID.
 */
export function getTemplateById(id: string): SchemaTemplate | undefined {
  return SCHEMA_TEMPLATES.find((t) => t.id === id);
}

/**
 * All available categories with display labels.
 */
export const TEMPLATE_CATEGORIES: { value: SchemaTemplate["category"]; label: string; icon: string }[] = [
  { value: "education", label: "Education", icon: "GraduationCap" },
  { value: "employment", label: "Employment", icon: "Briefcase" },
  { value: "identity", label: "Identity", icon: "IdCard" },
  { value: "certification", label: "Certification", icon: "Award" },
  { value: "event", label: "Events", icon: "CalendarCheck" },
];
