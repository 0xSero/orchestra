# Memory Tools

## memory_put

Description: Write a memory entry (file-based by default; Neo4j optional).

Parameters:
- scope (project|global, optional)
- key (string, required)
- value (string, required)
- tags (string[], optional)

Returns: status string.

## memory_search

Description: Search memory entries.

Parameters:
- query (string, required)
- scope (project|global, optional)
- limit (number, optional)
- format (markdown|json, optional)

Returns: JSON list.

## memory_recent

Description: Get recent memory entries.

Parameters:
- scope (project|global, optional)
- limit (number, optional)
- format (markdown|json, optional)

Returns: JSON list.

## memory_link

Description: Link two memory entries.

Parameters:
- scope (project|global, optional)
- fromKey (string, required)
- toKey (string, required)
- relation (string, optional)

Returns: status string.
