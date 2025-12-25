import { loadNeo4jConfig, withNeo4jSession } from "../src/memory/neo4j";

async function analyzeMemoryGraph() {
  // Load Neo4j configuration
  const config = loadNeo4jConfig();
  
  if (!config) {
    console.log("❌ No Neo4j configuration found");
    console.log("Please set OPENCODE_NEO4J_URI, OPENCODE_NEO4J_USERNAME, and OPENCODE_NEO4J_PASSWORD environment variables");
    console.log("Or configure Neo4j in your orchestrator.json file");
    return;
  }

  console.log("🔍 Analyzing Neo4j Memory Graph...");
  console.log(`📡 Connecting to: ${config.uri}`);
  console.log("")

  try {
    // 1. Get all node types/labels and their counts
    console.log("1️⃣ Node Types and Counts:");
    console.log("=" .repeat(40));
    
    const nodeTypes = await withNeo4jSession(config, async (session) => {
      const result = await session.run(`
        CALL db.labels() YIELD label
        CALL apoc.cypher.run('MATCH (n:' + label + ') RETURN count(n) as count', {}) YIELD value
        RETURN label, value.count as count
        ORDER BY count DESC
      `);
      return result.records.map(record => ({
        label: record.get('label'),
        count: record.get('count').toNumber()
      }));
    });

    nodeTypes.forEach(({ label, count }) => {
      console.log(`  ${label}: ${count.toLocaleString()}`);
    });

    // 2. Get all relationship types and their counts
    console.log("\n2️⃣ Relationship Types and Counts:");
    console.log("=" .repeat(40));
    
    const relationshipTypes = await withNeo4jSession(config, async (session) => {
      const result = await session.run(`
        CALL db.relationshipTypes() YIELD relationshipType
        CALL apoc.cypher.run('MATCH ()-[r:' + relationshipType + ']->() RETURN count(r) as count', {}) YIELD value
        RETURN relationshipType, value.count as count
        ORDER BY count DESC
      `);
      return result.records.map(record => ({
        type: record.get('relationshipType'),
        count: record.get('count').toNumber()
      }));
    });

    relationshipTypes.forEach(({ type, count }) => {
      console.log(`  ${type}: ${count.toLocaleString()}`);
    });

    // 3. Sample key entities (Memory nodes)
    console.log("\n3️⃣ Sample Key Entities (Memory Nodes):");
    console.log("=" .repeat(40));
    
    const sampleEntities = await withNeo4jSession(config, async (session) => {
      const result = await session.run(`
        MATCH (n:Memory)
        RETURN n.key as key, n.value as value, n.tags as tags, n.scope as scope, 
               n.projectId as projectId, n.createdAt as createdAt, n.updatedAt as updatedAt
        ORDER BY n.updatedAt DESC
        LIMIT 15
      `);
      return result.records.map(record => ({
        key: record.get('key'),
        value: record.get('value'),
        tags: record.get('tags') || [],
        scope: record.get('scope'),
        projectId: record.get('projectId'),
        createdAt: record.get('createdAt')?.toNumber(),
        updatedAt: record.get('updatedAt')?.toNumber()
      }));
    });

    sampleEntities.forEach((entity, index) => {
      console.log(`\n  ${index + 1}. Key: ${entity.key}`);
      console.log(`     Scope: ${entity.scope}${entity.projectId ? ` (Project: ${entity.projectId})` : ''}`);
      console.log(`     Tags: [${entity.tags.join(', ')}]`);
      console.log(`     Value: ${entity.value.substring(0, 100)}${entity.value.length > 100 ? '...' : ''}`);
      if (entity.createdAt) {
        console.log(`     Created: ${new Date(entity.createdAt).toISOString()}`);
      }
    });

    // 4. Key relationships between entities
    console.log("\n4️⃣ Key Relationships Between Entities:");
    console.log("=" .repeat(40));
    
    const relationships = await withNeo4jSession(config, async (session) => {
      const result = await session.run(`
        MATCH (a:Memory)-[r:RELATES_TO]->(b:Memory)
        RETURN a.key as from_key, b.key as to_key, r.type as relationship_type, count(*) as count
        ORDER BY count DESC
        LIMIT 20
      `);
      return result.records.map(record => ({
        from: record.get('from_key'),
        to: record.get('to_key'),
        type: record.get('relationship_type'),
        count: record.get('count').toNumber()
      }));
    });

    relationships.forEach(({ from, to, type, count }) => {
      console.log(`  ${from} → [${type}] → ${to} (${count} occurrence${count > 1 ? 's' : ''})`);
    });

    // 5. Notable patterns in stored knowledge
    console.log("\n5️⃣ Notable Patterns in Stored Knowledge:");
    console.log("=" .repeat(40));
    
    // Pattern 1: Message distribution by scope
    const scopeDistribution = await withNeo4jSession(config, async (session) => {
      const result = await session.run(`
        MATCH (n:Memory)
        WHERE n.key STARTS WITH 'message:'
        RETURN n.scope as scope, count(n) as count
        ORDER BY count DESC
      `);
      return result.records.map(record => ({
        scope: record.get('scope'),
        count: record.get('count').toNumber()
      }));
    });

    console.log("\n  📨 Message Distribution by Scope:");
    scopeDistribution.forEach(({ scope, count }) => {
      console.log(`    ${scope}: ${count.toLocaleString()} messages`);
    });

    // Pattern 2: Project activity summary
    const projectActivity = await withNeo4jSession(config, async (session) => {
      const result = await session.run(`
        MATCH (n:Memory)
        WHERE n.projectId IS NOT NULL
        RETURN n.projectId as project_id, count(n) as activity_count, 
               max(n.updatedAt) as last_updated
        ORDER BY activity_count DESC
        LIMIT 10
      `);
      return result.records.map(record => ({
        projectId: record.get('project_id'),
        activityCount: record.get('activity_count').toNumber(),
        lastUpdated: record.get('last_updated')?.toNumber()
      }));
    });

    console.log("\n  📊 Top 10 Most Active Projects:");
    projectActivity.forEach(({ projectId, activityCount, lastUpdated }) => {
      console.log(`    ${projectId}: ${activityCount} entries${lastUpdated ? ` (last: ${new Date(lastUpdated).toISOString()})` : ''}`);
    });

    // Pattern 3: Tag analysis
    const tagAnalysis = await withNeo4jSession(config, async (session) => {
      const result = await session.run(`
        MATCH (n:Memory)
        UNWIND coalesce(n.tags, []) as tag
        RETURN tag, count(n) as usage_count
        ORDER BY usage_count DESC
        LIMIT 15
      `);
      return result.records.map(record => ({
        tag: record.get('tag'),
        usageCount: record.get('usage_count').toNumber()
      }));
    });

    console.log("\n  🏷️ Most Used Tags:");
    tagAnalysis.forEach(({ tag, usageCount }) => {
      console.log(`    ${tag}: ${usageCount} times`);
    });

    // Pattern 4: Summary analysis
    const summaryInfo = await withNeo4jSession(config, async (session) => {
      const result = await session.run(`
        MATCH (n:Memory)
        WHERE n.key CONTAINS 'summary:'
        RETURN 
          count(n) as total_summaries,
          avg(size(n.value)) as avg_summary_length,
          min(size(n.value)) as min_summary_length,
          max(size(n.value)) as max_summary_length
      `);
      const record = result.records[0];
      return {
        totalSummaries: record.get('total_summaries').toNumber(),
        avgLength: Math.round(record.get('avg_summary_length')?.toNumber() || 0),
        minLength: record.get('min_summary_length').toNumber(),
        maxLength: record.get('max_summary_length').toNumber()
      };
    });

    console.log("\n  📋 Summary Statistics:");
    console.log(`    Total summaries: ${summaryInfo.totalSummaries}`);
    console.log(`    Average length: ${summaryInfo.avgLength} characters`);
    console.log(`    Length range: ${summaryInfo.minLength} - ${summaryInfo.maxLength} characters`);

    // Pattern 5: User activity
    const userActivity = await withNeo4jSession(config, async (session) => {
      const result = await session.run(`
        MATCH (n:Memory)
        WHERE 'user' IN coalesce(n.tags, [])
        RETURN split(n.key, ':')[1] as user_id, count(n) as activity_count
        ORDER BY activity_count DESC
        LIMIT 10
      `);
      return result.records.map(record => ({
        userId: record.get('user_id'),
        activityCount: record.get('activity_count').toNumber()
      }));
    });

    console.log("\n  👤 Top 10 Most Active Users:");
    userActivity.forEach(({ userId, activityCount }) => {
      console.log(`    User ${userId}: ${activityCount} entries`);
    });

    console.log("\n✅ Memory graph analysis complete!");

  } catch (error) {
    console.error("❌ Error analyzing memory graph:", error);
    if (error.message.includes('Failed to connect')) {
      console.log("\n💡 Troubleshooting tips:");
      console.log("1. Verify Neo4j is running and accessible");
      console.log("2. Check connection URI, username, and password");
      console.log("3. Ensure network connectivity to Neo4j instance");
      console.log("4. Verify Neo4j has the APOC plugin installed (for some queries)");
    }
  }
}

// Run the analysis
if (import.meta.main) {
  analyzeMemoryGraph();
}