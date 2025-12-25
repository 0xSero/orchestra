import { loadNeo4jConfig, withNeo4jSession } from "../src/memory/neo4j";

async function checkNeo4jStatus() {
  console.log("🔍 Neo4j Memory System Status Check");
  console.log("=" .repeat(50));
  
  // Check current configuration
  const currentConfig = loadNeo4jConfig();
  
  if (currentConfig) {
    console.log("✅ Neo4j is configured");
    console.log(`📡 URI: ${currentConfig.uri}`);
    console.log(`👤 Username: ${currentConfig.username}`);
    console.log(`🗄️  Database: ${currentConfig.database || 'default'}`);
    
    try {
      // Test connection
      console.log("\n🧪 Testing connection...");
      const result = await withNeo4jSession(currentConfig, async (session) => {
        return session.run("RETURN 1 AS connected, timestamp() as timestamp");
      });
      
      const record = result.records[0];
      console.log("✅ Successfully connected to Neo4j!");
      console.log(`   Connection test: ${record.get('connected')}`);
      console.log(`   Server timestamp: ${new Date(record.get('timestamp').toNumber()).toISOString()}`);
      
      // Get basic server info
      const serverInfo = await withNeo4jSession(currentConfig, async (session) => {
        return session.run("CALL dbms.components() YIELD name, versions, edition");
      });
      
      console.log("\n🖥️  Neo4j Server Information:");
      serverInfo.records.forEach(record => {
        console.log(`   ${record.get('name')}: ${record.get('versions').join(', ')} (${record.get('edition')})`);
      });
      
      // Check if APOC is available
      const apocCheck = await withNeo4jSession(currentConfig, async (session) => {
        try {
          return session.run("RETURN apoc.version() as apoc_version");
        } catch {
          return null;
        }
      });
      
      if (apocCheck && apocCheck.records.length > 0) {
        console.log(`   APOC Plugin: Available (${apocCheck.records[0].get('apoc_version')})`);
      } else {
        console.log("   APOC Plugin: Not detected");
      }
      
    } catch (error) {
      console.error("❌ Connection failed:", error.message);
      console.log("\n💡 Troubleshooting tips:");
      console.log("1. Verify Neo4j is running and accessible");
      console.log("2. Check connection URI, username, and password");
      console.log("3. Ensure network connectivity to Neo4j instance");
      console.log("4. Check Neo4j logs for authentication errors");
    }
  } else {
    console.log("❌ Neo4j is not configured");
    console.log("\n🔧 Configuration Options:");
    console.log("1. Environment Variables (highest priority):");
    console.log("   - OPENCODE_NEO4J_URI (e.g., bolt://localhost:7687)");
    console.log("   - OPENCODE_NEO4J_USERNAME (e.g., neo4j)");
    console.log("   - OPENCODE_NEO4J_PASSWORD");
    console.log("   - OPENCODE_NEO4J_DATABASE (optional, defaults to system database)");
    console.log("\n2. Orchestrator Configuration File:");
    console.log("   Create orchestrator.json with integrations.neo4j section");
    console.log("\n3. Example Configuration:");
    console.log(`   {
     "integrations": {
       "neo4j": {
         "enabled": true,
         "uri": "bolt://localhost:7687",
         "username": "neo4j",
         "password": "your-password",
         "database": "neo4j"
       }
     }
   }`);
    
    console.log("\n📝 Current Memory System Status:");
    console.log("   Since Neo4j is not configured, the system is using file-based memory storage.");
    console.log("   File location: ~/.config/opencode/orchestrator-memory/");
    console.log("   Run 'bun run scripts/analyze-file-memory.ts' to analyze stored data.");
  }
  
  console.log("\n" + "=".repeat(50));
  console.log("📊 Memory System Comparison:");
  console.log("=" .repeat(50));
  console.log("File-Based Memory (Current):");
  console.log("  ✅ No external dependencies");
  console.log("  ✅ Works offline");
  console.log("  ❌ Limited query capabilities");
  console.log("  ❌ No relationship analysis");
  console.log("  ❌ Single-machine only");
  console.log("\nNeo4j Graph Database:");
  console.log("  ✅ Advanced graph queries");
  console.log("  ✅ Relationship analysis");
  console.log("  ✅ Multi-project support");
  console.log("  ✅ Network accessible");
  console.log("  ❌ Requires Neo4j installation");
  console.log("  ❌ Network configuration needed");
}

// Run the status check
if (import.meta.main) {
  checkNeo4jStatus();
}