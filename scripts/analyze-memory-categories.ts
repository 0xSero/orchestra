import { loadNeo4jConfig, withNeo4jSession } from "../src/memory/neo4j.ts";

async function analyzeMemoryCategories() {
  const config = loadNeo4jConfig();
  
  if (!config) {
    console.log("❌ No Neo4j configuration found");
    return;
  }

  console.log("🔍 Analyzing Memory Categories in Neo4j...");
  console.log("=".repeat(60));

  try {
    await withNeo4jSession(config, async (session) => {
      // 1. Architectural Decisions
      console.log("\n🏗️  Architectural Decisions:");
      console.log("-".repeat(40));
      
      const archResults = await session.run(`
        MATCH (n:Memory)
        WHERE n.key CONTAINS 'architecture' 
           OR n.key CONTAINS 'decision'
           OR n.key CONTAINS 'design'
           OR n.tags CONTAINS 'architecture'
           OR n.tags CONTAINS 'decision'
        RETURN n.key as key, n.value as value, n.scope as scope, n.projectId as projectId
        ORDER BY n.updatedAt DESC
        LIMIT 10
      `);
      
      if (archResults.records.length === 0) {
        console.log("  No architectural decisions found.");
      } else {
        archResults.records.forEach((record, index) => {
          const key = record.get("key");
          const value = record.get("value");
          const scope = record.get("scope");
          const projectId = record.get("projectId");
          console.log(`\n  ${index + 1}. ${key}`);
          console.log(`     Scope: ${scope}${projectId ? ` (Project: ${projectId})` : ''}`);
          console.log(`     Summary: ${value.substring(0, 100)}${value.length > 100 ? '...' : ''}`);
        });
      }
      
      // 2. Key Entities
      console.log("\n🔑 Key Entities:");
      console.log("-".repeat(40));
      
      const entityResults = await session.run(`
        MATCH (n:Memory)
        WHERE n.key CONTAINS 'entity:' 
           OR n.key CONTAINS 'component:'
           OR n.key CONTAINS 'module:'
           OR n.tags CONTAINS 'entity'
           OR n.tags CONTAINS 'component'
        RETURN n.key as key, n.value as value, n.scope as scope, n.projectId as projectId
        ORDER BY n.updatedAt DESC
        LIMIT 10
      `);
      
      if (entityResults.records.length === 0) {
        console.log("  No key entities found.");
      } else {
        entityResults.records.forEach((record, index) => {
          const key = record.get("key");
          const value = record.get("value");
          const scope = record.get("scope");
          const projectId = record.get("projectId");
          console.log(`\n  ${index + 1}. ${key}`);
          console.log(`     Scope: ${scope}${projectId ? ` (Project: ${projectId})` : ''}`);
          console.log(`     Summary: ${value.substring(0, 100)}${value.length > 100 ? '...' : ''}`);
        });
      }
      
      // 3. Important Constraints
      console.log("\n⛔ Important Constraints:");
      console.log("-".repeat(40));
      
      const constraintResults = await session.run(`
        MATCH (n:Memory)
        WHERE n.key CONTAINS 'constraint:' 
           OR n.key CONTAINS 'limitation:'
           OR n.key CONTAINS 'restriction:'
           OR n.tags CONTAINS 'constraint'
           OR n.tags CONTAINS 'limitation'
        RETURN n.key as key, n.value as value, n.scope as scope, n.projectId as projectId
        ORDER BY n.updatedAt DESC
        LIMIT 10
      `);
      
      if (constraintResults.records.length === 0) {
        console.log("  No constraints found.");
      } else {
        constraintResults.records.forEach((record, index) => {
          const key = record.get("key");
          const value = record.get("value");
          const scope = record.get("scope");
          const projectId = record.get("projectId");
          console.log(`\n  ${index + 1}. ${key}`);
          console.log(`     Scope: ${scope}${projectId ? ` (Project: ${projectId})` : ''}`);
          console.log(`     Summary: ${value.substring(0, 100)}${value.length > 100 ? '...' : ''}`);
        });
      }
      
      // 4. Recurring Issues
      console.log("\n🐛 Recurring Issues:");
      console.log("-".repeat(40));
      
      const issueResults = await session.run(`
        MATCH (n:Memory)
        WHERE n.key CONTAINS 'issue:' 
           OR n.key CONTAINS 'problem:'
           OR n.key CONTAINS 'error:'
           OR n.key CONTAINS 'bug:'
           OR n.tags CONTAINS 'issue'
           OR n.tags CONTAINS 'bug'
           OR n.tags CONTAINS 'problem'
        RETURN n.key as key, n.value as value, n.scope as scope, n.projectId as projectId
        ORDER BY n.updatedAt DESC
        LIMIT 10
      `);
      
      if (issueResults.records.length === 0) {
        console.log("  No recurring issues found.");
      } else {
        issueResults.records.forEach((record, index) => {
          const key = record.get("key");
          const value = record.get("value");
          const scope = record.get("scope");
          const projectId = record.get("projectId");
          console.log(`\n  ${index + 1}. ${key}`);
          console.log(`     Scope: ${scope}${projectId ? ` (Project: ${projectId})` : ''}`);
          console.log(`     Summary: ${value.substring(0, 100)}${value.length > 100 ? '...' : ''}`);
        });
      }
      
      // 5. "How Things Work" Summaries
      console.log("\n📚 How Things Work Summaries:");
      console.log("-".repeat(40));
      
      const howtoResults = await session.run(`
        MATCH (n:Memory)
        WHERE n.key CONTAINS 'howto:' 
           OR n.key CONTAINS 'guide:'
           OR n.key CONTAINS 'process:'
           OR n.key CONTAINS 'workflow:'
           OR n.tags CONTAINS 'howto'
           OR n.tags CONTAINS 'guide'
           OR n.tags CONTAINS 'process'
        RETURN n.key as key, n.value as value, n.scope as scope, n.projectId as projectId
        ORDER BY n.updatedAt DESC
        LIMIT 10
      `);
      
      if (howtoResults.records.length === 0) {
        console.log("  No how-to guides found.");
      } else {
        howtoResults.records.forEach((record, index) => {
          const key = record.get("key");
          const value = record.get("value");
          const scope = record.get("scope");
          const projectId = record.get("projectId");
          console.log(`\n  ${index + 1}. ${key}`);
          console.log(`     Scope: ${scope}${projectId ? ` (Project: ${projectId})` : ''}`);
          console.log(`     Summary: ${value.substring(0, 100)}${value.length > 100 ? '...' : ''}`);
        });
      }
      
      // 6. Messages and Conversations
      console.log("\n💬 Messages and Conversations:");
      console.log("-".repeat(40));
      
      const messageResults = await session.run(`
        MATCH (n:Memory)
        WHERE n.key STARTS WITH 'message:'
        RETURN n.key as key, n.value as value, n.scope as scope, n.projectId as projectId
        ORDER BY n.updatedAt DESC
        LIMIT 5
      `);
      
      if (messageResults.records.length === 0) {
        console.log("  No messages found.");
      } else {
        messageResults.records.forEach((record, index) => {
          const key = record.get("key");
          const value = record.get("value");
          const scope = record.get("scope");
          const projectId = record.get("projectId");
          console.log(`\n  ${index + 1}. ${key}`);
          console.log(`     Scope: ${scope}${projectId ? ` (Project: ${projectId})` : ''}`);
          console.log(`     Message: ${value.substring(0, 100)}${value.length > 100 ? '...' : ''}`);
        });
      }
      
      // 7. Summary Statistics
      console.log("\n📊 Summary Statistics:");
      console.log("=".repeat(60));
      
      const statsResult = await session.run(`
        MATCH (n:Memory)
        WITH 
          count(n) as total_memories,
          count(DISTINCT n.scope) as unique_scopes,
          count(DISTINCT n.projectId) as unique_projects,
          count(DISTINCT n.key) as unique_keys
        RETURN total_memories, unique_scopes, unique_projects, unique_keys
      `);
      
      const stats = statsResult.records[0];
      console.log(`  Total memories: ${stats.get("total_memories")}`);
      console.log(`  Unique scopes: ${stats.get("unique_scopes")}`);
      console.log(`  Unique projects: ${stats.get("unique_projects")}`);
      console.log(`  Unique keys: ${stats.get("unique_keys")}`);
      
      // Get tag distribution
      console.log("\n  🏷️  Tag Distribution:");
      const tagResult = await session.run(`
        MATCH (n:Memory)
        UNWIND coalesce(n.tags, []) as tag
        RETURN tag, count(n) as usage
        ORDER BY usage DESC
        LIMIT 10
      `);
      
      if (tagResult.records.length === 0) {
        console.log("    No tags found.");
      } else {
        tagResult.records.forEach(record => {
          const tag = record.get("tag");
          const usage = record.get("usage");
          console.log(`    ${tag}: ${usage} times`);
        });
      }
    });
    
    console.log("\n✅ Memory category analysis complete!");
    
  } catch (error) {
    console.error("❌ Error analyzing memory categories:", error);
  }
}

// Run the analysis
analyzeMemoryCategories();