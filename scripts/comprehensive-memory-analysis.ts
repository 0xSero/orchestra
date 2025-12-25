import { loadNeo4jConfig, withNeo4jSession } from "../src/memory/neo4j.ts";

async function comprehensiveMemoryAnalysis() {
  const config = loadNeo4jConfig();
  
  if (!config) {
    console.log("❌ No Neo4j configuration found");
    return;
  }

  console.log("🔍 Comprehensive Neo4j Memory Analysis");
  console.log("=".repeat(70));
  console.log(`📡 Database: ${config.uri}`);
  console.log(`📅 Analysis Date: ${new Date().toISOString()}`);
  console.log("");

  try {
    await withNeo4jSession(config, async (session) => {
      // 1. Overall Graph Statistics
      console.log("1️⃣  OVERALL GRAPH STATISTICS");
      console.log("-".repeat(50));
      
      const graphStats = await session.run(`
        MATCH (n)
        OPTIONAL MATCH (n)-[r]-()
        RETURN 
          count(DISTINCT n) as total_nodes,
          count(DISTINCT r) as total_relationships,
          count(DISTINCT labels(n)) as unique_labels
      `);
      
      const stats = graphStats.records[0];
      console.log(`   Total Nodes: ${stats.get("total_nodes")}`);
      console.log(`   Total Relationships: ${stats.get("total_relationships")}`);
      console.log(`   Unique Node Labels: ${stats.get("unique_labels")}`);
      
      // 2. Memory-Specific Statistics
      console.log("\n2️⃣  MEMORY-SPECIFIC STATISTICS");
      console.log("-".repeat(50));
      
      const memoryStats = await session.run(`
        MATCH (n:Memory)
        OPTIONAL MATCH (n)-[r]-(m:Memory)
        RETURN 
          count(DISTINCT n) as memory_nodes,
          count(DISTINCT r) as memory_relationships,
          count(DISTINCT n.scope) as unique_scopes,
          count(DISTINCT n.projectId) as unique_projects
      `);
      
      const memStats = memoryStats.records[0];
      console.log(`   Memory Nodes: ${memStats.get("memory_nodes")}`);
      console.log(`   Memory Relationships: ${memStats.get("memory_relationships")}`);
      console.log(`   Unique Scopes: ${memStats.get("unique_scopes")}`);
      console.log(`   Unique Projects: ${memStats.get("unique_projects")}`);
      
      // 3. All Memory Nodes (Current State)
      console.log("\n3️⃣  ALL MEMORY NODES");
      console.log("-".repeat(50));
      
      const allMemories = await session.run(`
        MATCH (n:Memory)
        RETURN 
          n.key as key,
          n.value as value,
          n.scope as scope,
          n.projectId as projectId,
          coalesce(n.tags, []) as tags,
          n.createdAt as createdAt,
          n.updatedAt as updatedAt
        ORDER BY n.updatedAt DESC
      `);
      
      if (allMemories.records.length === 0) {
        console.log("   No memory nodes found in the graph.");
      } else {
        allMemories.records.forEach((record, index) => {
          const key = record.get("key");
          const value = record.get("value");
          const scope = record.get("scope");
          const projectId = record.get("projectId");
          const tags = record.get("tags");
          const createdAt = record.get("createdAt");
          const updatedAt = record.get("updatedAt");
          
          console.log(`\n   ${index + 1}. Key: ${key}`);
          console.log(`      Scope: ${scope}`);
          if (projectId) console.log(`      Project: ${projectId}`);
          if (tags.length > 0) console.log(`      Tags: [${tags.join(', ')}]`);
          if (createdAt) console.log(`      Created: ${new Date(createdAt).toISOString()}`);
          if (updatedAt) console.log(`      Updated: ${new Date(updatedAt).toISOString()}`);
          console.log(`      Value Preview: ${value.substring(0, 100)}${value.length > 100 ? '...' : ''}`);
        });
      }
      
      // 4. Relationships Analysis
      console.log("\n4️⃣  RELATIONSHIPS ANALYSIS");
      console.log("-".repeat(50));
      
      const relationships = await session.run(`
        MATCH (a:Memory)-[r]-(b:Memory)
        RETURN 
          type(r) as relationship_type,
          count(r) as count,
          collect({
            from: a.key,
            to: b.key,
            properties: properties(r)
          })[0..3] as examples
        ORDER BY count DESC
      `);
      
      if (relationships.records.length === 0) {
        console.log("   No relationships between memory nodes found.");
      } else {
        relationships.records.forEach(record => {
          const type = record.get("relationship_type");
          const count = record.get("count");
          const examples = record.get("examples");
          
          console.log(`\n   Relationship Type: ${type}`);
          console.log(`   Count: ${count}`);
          if (examples.length > 0) {
            console.log(`   Examples:`);
            examples.forEach((example: any, i: number) => {
              console.log(`     ${i + 1}. ${example.from} --[${type}]-- ${example.to}`);
            });
          }
        });
      }
      
      // 5. Scope Distribution
      console.log("\n5️⃣  SCOPE DISTRIBUTION");
      console.log("-".repeat(50));
      
      const scopeDist = await session.run(`
        MATCH (n:Memory)
        RETURN 
          n.scope as scope,
          count(n) as count,
          collect(n.key)[0..5] as sample_keys
        ORDER BY count DESC
      `);
      
      scopeDist.records.forEach(record => {
        const scope = record.get("scope");
        const count = record.get("count");
        const samples = record.get("sample_keys");
        
        console.log(`\n   Scope: ${scope}`);
        console.log(`   Count: ${count}`);
        console.log(`   Sample Keys: ${samples.join(', ')}${count > samples.length ? '...' : ''}`);
      });
      
      // 6. Project Distribution (if any)
      console.log("\n6️⃣  PROJECT DISTRIBUTION");
      console.log("-".repeat(50));
      
      const projectDist = await session.run(`
        MATCH (n:Memory)
        WHERE n.projectId IS NOT NULL
        RETURN 
          n.projectId as project_id,
          count(n) as count,
          collect(n.key)[0..5] as sample_keys
        ORDER BY count DESC
      `);
      
      if (projectDist.records.length === 0) {
        console.log("   No project-specific memories found.");
      } else {
        projectDist.records.forEach(record => {
          const projectId = record.get("project_id");
          const count = record.get("count");
          const samples = record.get("sample_keys");
          
          console.log(`\n   Project: ${projectId}`);
          console.log(`   Count: ${count}`);
          console.log(`   Sample Keys: ${samples.join(', ')}${count > samples.length ? '...' : ''}`);
        });
      }
      
      // 7. Tag Analysis
      console.log("\n7️⃣  TAG ANALYSIS");
      console.log("-".repeat(50));
      
      const tagAnalysis = await session.run(`
        MATCH (n:Memory)
        UNWIND coalesce(n.tags, []) as tag
        RETURN 
          tag,
          count(n) as usage_count,
          collect(n.key)[0..3] as used_in
        ORDER BY usage_count DESC
      `);
      
      if (tagAnalysis.records.length === 0) {
        console.log("   No tags found in memory nodes.");
      } else {
        console.log("   Tag Usage:");
        tagAnalysis.records.forEach(record => {
          const tag = record.get("tag");
          const count = record.get("usage_count");
          const usedIn = record.get("used_in");
          
          console.log(`\n     Tag: ${tag}`);
          console.log(`     Used: ${count} times`);
          console.log(`     In: ${usedIn.join(', ')}${count > usedIn.length ? '...' : ''}`);
        });
      }
      
      // 8. Time-based Analysis
      console.log("\n8️⃣  TIME-BASED ANALYSIS");
      console.log("-".repeat(50));
      
      const timeAnalysis = await session.run(`
        MATCH (n:Memory)
        WHERE n.createdAt IS NOT NULL
        RETURN 
          count(n) as dated_entries,
          min(n.createdAt) as earliest,
          max(n.createdAt) as latest
      `);
      
      if (timeAnalysis.records[0].get("dated_entries") > 0) {
        const datedCount = timeAnalysis.records[0].get("dated_entries");
        const earliest = timeAnalysis.records[0].get("earliest");
        const latest = timeAnalysis.records[0].get("latest");
        
        console.log(`   Entries with timestamps: ${datedCount}`);
        console.log(`   Earliest: ${new Date(earliest).toISOString()}`);
        console.log(`   Latest: ${new Date(latest).toISOString()}`);
      } else {
        console.log("   No entries with timestamps found.");
      }
      
      // 9. Content Length Analysis
      console.log("\n9️⃣  CONTENT ANALYSIS");
      console.log("-".repeat(50));
      
      const contentAnalysis = await session.run(`
        MATCH (n:Memory)
        RETURN 
          count(n) as total_entries,
          avg(size(n.value)) as avg_length,
          min(size(n.value)) as min_length,
          max(size(n.value)) as max_length
      `);
      
      const contentStats = contentAnalysis.records[0];
      console.log(`   Total Entries: ${contentStats.get("total_entries")}`);
      console.log(`   Average Content Length: ${Math.round(contentStats.get("avg_length"))} characters`);
      console.log(`   Shortest Entry: ${contentStats.get("min_length")} characters`);
      console.log(`   Longest Entry: ${contentStats.get("max_length")} characters`);
    });
    
    console.log("\n" + "=".repeat(70));
    console.log("✅ Comprehensive memory analysis complete!");
    
  } catch (error) {
    console.error("❌ Error during comprehensive analysis:", error);
    console.log("\n💡 Troubleshooting tips:");
    console.log("1. Verify Neo4j is running and accessible");
    console.log("2. Check connection credentials");
    console.log("3. Ensure memory nodes exist in the graph");
  }
}

// Run the analysis
comprehensiveMemoryAnalysis();