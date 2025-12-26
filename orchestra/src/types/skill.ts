/**
 * Skill type definitions following the Agent Skills Standard
 * with OpenCode extensions for profile configuration.
 *
 * @see https://agentskills.io
 * @see https://opencode.ai/docs/skills/
 */

import type { ToolPermissions } from "./permissions";

// ============================================================================
// Standard Agent Skills Frontmatter (per specification)
// ============================================================================

/**
 * Standard Agent Skills frontmatter fields.
 * These fields are defined by the Agent Skills specification.
 */
export interface SkillFrontmatterBase {
  /**
   * Unique identifier for the skill.
   * Must be lowercase alphanumeric with single hyphens.
   * Pattern: ^[a-z0-9]+(-[a-z0-9]+)*$
   * Length: 1-64 characters
   * Must match the containing directory name.
   */
  name: string;

  /**
   * Description of what the skill does and when to use it.
   * This is the primary mechanism for skill selection.
   * Length: 1-1024 characters
   */
  description: string;

  /**
   * License for the skill (e.g., "MIT", "Apache-2.0").
   * Optional standard field.
   */
  license?: string;

  /**
   * Custom metadata key-value pairs.
   * Optional standard field.
   */
  metadata?: Record<string, unknown>;
}

// ============================================================================
// OpenCode Profile Extensions
// ============================================================================

/**
 * OpenCode-specific extensions for profile configuration.
 * These fields extend the standard with model/tool configuration.
 */
export interface ProfileExtensions {
  /**
   * Model specification for this profile.
   * Can be a node tag (node:fast, node:code, node:reasoning, node:vision, node:docs)
   * or a specific provider/model identifier.
   */
  model: string;

  /**
   * Provider ID for model resolution.
   */
  providerID?: string;

  /**
   * Model temperature setting (0-2).
   * Lower = more focused/deterministic, Higher = more creative.
   */
  temperature?: number;

  /**
   * Tool enable/disable configuration.
   * Keys are tool names, values are whether the tool is enabled.
   */
  tools?: Record<string, boolean>;

  /**
   * Permission constraints for this profile.
   */
  permissions?: ToolPermissions;

  /**
   * Keywords/tags for matching and categorization.
   */
  tags?: string[];

  /**
   * Whether this profile supports vision/image input.
   */
  supportsVision?: boolean;

  /**
   * Whether this profile has web access.
   */
  supportsWeb?: boolean;

  /**
   * Whether to inject repository context on auto-launch.
   */
  injectRepoContext?: boolean;

  /**
   * Extend another profile by ID (single inheritance).
   */
  extends?: string;

  /**
   * Compose multiple profiles (multi-inheritance).
   */
  compose?: string[];
}

// ============================================================================
// Combined Skill Types
// ============================================================================

/**
 * Complete skill frontmatter combining standard fields with OpenCode extensions.
 */
export interface SkillFrontmatter extends SkillFrontmatterBase, ProfileExtensions {}

/**
 * Source location of a skill.
 */
export type SkillSource =
  | { type: "builtin" }
  | { type: "global"; path: string }
  | { type: "project"; path: string };

/**
 * Complete skill definition with parsed content.
 */
export interface Skill {
  /**
   * Unique identifier (directory name).
   */
  id: string;

  /**
   * Source location of this skill.
   */
  source: SkillSource;

  /**
   * Parsed YAML frontmatter.
   */
  frontmatter: SkillFrontmatter;

  /**
   * System prompt / instructions (markdown body).
   */
  systemPrompt: string;

  /**
   * Full file path to SKILL.md.
   */
  filePath: string;

  /**
   * Whether the skill has a scripts/ subdirectory.
   */
  hasScripts: boolean;

  /**
   * Whether the skill has a references/ subdirectory.
   */
  hasReferences: boolean;

  /**
   * Whether the skill has an assets/ subdirectory.
   */
  hasAssets: boolean;

  /**
   * When the skill was created (from file system).
   */
  createdAt?: Date;

  /**
   * When the skill was last modified (from file system).
   */
  updatedAt?: Date;
}

// ============================================================================
// Input Types for CRUD Operations
// ============================================================================

/**
 * Input for creating or updating a skill.
 */
export interface SkillInput {
  /**
   * Skill ID (will become directory name).
   */
  id: string;

  /**
   * Frontmatter configuration.
   */
  frontmatter: Omit<SkillFrontmatter, "name"> & { name?: string };

  /**
   * System prompt / instructions content.
   */
  systemPrompt: string;
}

/**
 * Scope for skill storage operations.
 */
export type SkillScope = "project" | "global";

// ============================================================================
// Validation Types
// ============================================================================

/**
 * Validation error for a specific field.
 */
export interface SkillValidationError {
  field: string;
  message: string;
}

/**
 * Result of skill validation.
 */
export interface SkillValidationResult {
  valid: boolean;
  errors: SkillValidationError[];
}
