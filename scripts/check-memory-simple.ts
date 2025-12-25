import { loadNeo4jConfig, withNeo4jSession } from "../src/memory/neo4j.ts";

async function checkMemoryGraph() {
  // Load Neo4j configuration
  const config = loadNeo4jConfig();
  
  if (!config) {
    console.log("❌ No Neo4j configuration found");
    console.log("Please set OPENCODE_NEO4J_URI, OPENCODE_NEO4J_USERNAME, and OPENCODE_NEO4J_PASSWORD environment variables");
    console.log("Or configure Neo4j in your orchestrator.json file");
    return;
  }

  console.log("🔍 Checking Neo4j Memory Graph...");
  console.log(`📡 Connecting to: ${config.uri}`);
  console.log("")

  try {
    await withNeo4jSession(config, async (session) => {
      // Test basic connection
      console.log("Testing connection...");
      await session.run("RETURN 1 as test");
      console.log("✅ Connected to Neo4j");
      
      // Get total node count
      const totalResult = await session.run("MATCH (n) RETURN count(n) as total");
      const totalNodes = totalResult.records[0].get("total");
      console.log(`📊 Total nodes in graph: ${totalNodes}`);
      
      // Get memory nodes
      const memoryResult = await session.run("MATCH (n:Memory) RETURN count(n) as count");
      const memoryCount = memoryResult.records[0].get("count");
      console.log(`🧠 Memory nodes: ${memoryCount}`);
      
      if (memoryCount > 0) {
        // Get sample memory nodes
        console.log("\n📋 Sample Memory Entries:");
        console.log("=".repeat(50));
        
        const sampleResult = await session.run(`
          MATCH (n:Memory)
          RETURN n.key as key, n.value as value, n.tags as tags, n.scope as scope, n.projectId as projectId
          ORDER BY n.updatedAt DESC
          LIMIT 10
        `);
        
        sampleResult.records.forEach((record, index) => {
          const key = record.get("key");
          const value = record.get("value");
          const tags = record.get("tags") || [];
          const scope = record.get("scope");
          const projectId = record.get("projectId");
          
          console.log(`\n${index + 1}. Key: ${key}`);
          console.log(`   Scope: ${scope}${projectId ? ` (Project: ${projectId})` : ''}`);
          console.log(`   Tags: [${tags.join(', ')}]`);
          console.log(`   Value: ${value.substring(0, 150)}${value.length > 150 ? '...' : ''}`);
        });
        
        // Get categories by analyzing keys
        console.log("\n📑 Memory Categories Analysis:");
        console.log("=".repeat(50));
        
        const categoryResult = await session.run(`
          MATCH (n:Memory)
          WITH 
            CASE 
              WHEN n.key STARTS WITH 'message:' THEN 'Messages'
              WHEN n.key STARTS WITH 'summary:' THEN 'Summaries'
              WHEN n.key STARTS WITH 'entity:' THEN 'Entities'
              WHEN n.key STARTS WITH 'decision:' THEN 'Decisions'
              WHEN n.key STARTS WITH 'constraint:' THEN 'Constraints'
              WHEN n.key STARTS WITH 'architecture:' THEN 'Architecture'
              WHEN n.key STARTS WITH 'issue:' THEN 'Issues'
              WHEN n.key STARTS WITH 'howto:' THEN 'How-To Guides'
              ELSE 'Other'
            END as category,
            count(n) as count
          RETURN category, count
          ORDER BY count DESC
        `);
        
        categoryResult.records.forEach(record => {
          const category = record.get("category");
          const count = record.get("count");
          console.log(`  ${category}: ${count} entries`);
        });
        
        // Get project vs global breakdown
        console.log("\n🌍 Project vs Global Memory:");
        console.log("=".repeat(50));
        
        const scopeResult = await session.run(`
          MATCH (n:Memory)
          RETURN 
            n.scope as scope,
            count(n) as count,
            count(DISTINCT n.projectId) as project_count
          ORDER BY count DESC
        `);
        
        scopeResult.records.forEach(record => {
          const scope = record.get("scope");
          const count = record.get("count");
          const projectCount = record.get("project_count");
          console.log(`  ${scope}: ${count} entries${scope === 'project' ? ` across ${projectCount} projects` : ''}`);
        });
        
        // Get most recent entries
        console.log("\n🕐 Most Recent Memory Entries:");
        console.log("=".repeat(50));
        
        const recentResult = await session.run(`
          MATCH (n:Memory)
          RETURN n.key as key, n.scope as scope, n.projectId as projectId, n.updatedAt as updated
          ORDER BY n.updatedAt DESC
          LIMIT 5
        `);
        
        recentResult.records.forEach(record => {
          const key = record.get("key");
          const scope = record.get("scope");
          const projectId = record.get("projectId");
          const updated = record.get("updated");
          
          console.log(`  ${key} (${scope}${projectId ? ` - ${projectId}` : ''})`);
          if (updated) {
            console.log(`    Updated: ${new Date(updated).toISOString()}`);
          }
        });
      }
    });
    
    console.log("\n✅ Memory graph check complete!");
    
  } catch (error) {
    console.error("❌ Error checking memory graph:", error);
    console.log("\n💡 Troubleshooting tips:");
    console.log("1. Verify Neo4j is running: docker ps");
    console.log("2. Check Neo4j logs: docker logs <container_name>");
    console.log("3. Verify connection details in orchestrator.json");
    console.log("4. Ensure Neo4j is accessible on the configured URI");
  }
}

// Run the check
checkMemoryGraph();