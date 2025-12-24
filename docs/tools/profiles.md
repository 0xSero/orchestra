# Profile Tools

## list_profiles

Description: List all worker profiles (built-in + custom).

Parameters:
- format (markdown|json, optional)

Returns: table or JSON.

## set_profile_model

Description: Override a profile model in config.

Parameters:
- profileId (string, required)
- model (string, required)
- scope (global|project, optional)
- showToast (boolean, optional)

Returns: status string.

## reset_profile_models

Description: Reset all pinned models for profiles.

Parameters:
- scope (global|project, required)
- showToast (boolean, optional)

Returns: status string.

## set_autospawn

Description: Update auto-spawn list of workers.

Parameters:
- scope (global|project, required)
- autoSpawn (boolean, required)
- workers (string[], required)

Returns: status string.

## set_spawn_policy

Description: Configure per-profile spawn policy overrides.

Parameters:
- scope (global|project, required)
- profileId (string, optional)
- autoSpawn (boolean, optional)
- onDemand (boolean, optional)
- allowManual (boolean, optional)
- warmPool (boolean, optional)
- reuseExisting (boolean, optional, deprecated; no effect)
- clear (boolean, optional)

Returns: status string.

## set_orchestrator_agent

Description: Update orchestrator agent settings in config.

Parameters:
- scope (global|project, required)
- enabled (boolean, optional)
- name (string, optional)
- model (string, optional)
- mode (primary|subagent, optional)
- color (string, optional)

Returns: status string.

## autofill_profile_models

Description: Pin profile models based on current OpenCode config.

Parameters:
- scope (global|project, required)
- profileIds (string[], optional)
- setAgent (boolean, optional)
- force (boolean, optional)
- showToast (boolean, optional)

Returns: summary string.
