export const SKILL_NAME_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export type SkillValidationResult = {
  ok: boolean;
  errors: string[];
};

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

export function validateSkillName(name: string): string | undefined {
  if (!isNonEmptyString(name)) return "name is required";
  if (name.length < 1 || name.length > 64)
    return "name must be 1-64 characters";
  if (!SKILL_NAME_REGEX.test(name))
    return "name must match ^[a-z0-9]+(-[a-z0-9]+)*$";
  return undefined;
}

export function validateSkillDescription(
  description: string,
): string | undefined {
  if (!isNonEmptyString(description)) return "description is required";
  if (description.length < 1 || description.length > 1024)
    return "description must be 1-1024 characters";
  return undefined;
}

export function validateSkillDefinition(input: {
  name: string;
  description?: string;
  directoryName?: string;
}): SkillValidationResult {
  const errors: string[] = [];
  const nameError = validateSkillName(input.name);
  if (nameError) errors.push(nameError);

  if (typeof input.description === "string") {
    const descriptionError = validateSkillDescription(input.description);
    if (descriptionError) errors.push(descriptionError);
  }

  if (input.directoryName && input.directoryName !== input.name) {
    errors.push("name must match directory name");
  }

  return { ok: errors.length === 0, errors };
}
