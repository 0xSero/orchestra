import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { Glob } from "bun";

function getUserConfigDir(): string {
  if (process.platform === "win32") {
    return process.env.APPDATA || join(homedir(), "AppData", "Roaming");
  }
  return process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
}

function getMemoryFilePath(scope: "global" | "project", projectId?: string): string {
  const base = join(getUserConfigDir(), "opencode", "orchestrator-memory");
  if (scope === "global") {
    return join(base, "global.json");
  }
  const safe = encodeURIComponent(projectId ?? "unknown");
  return join(base, "projects", `${safe}.json`);
}

interface MemoryNode {
  scope: "global" | "project";
  projectId?: string;
  key: string;
  value: string;
  tags: string[];
  createdAt?: number;
  updatedAt?: number;
}

interface MemoryLink {
  fromKey: string;
  toKey: string;
  type: string;
  createdAt: number;
  updatedAt: number;
}

interface MemoryFile {
  version: 1;
  updatedAt: number;
  nodes: MemoryNode[];
  links: MemoryLink[];
}

async function readMemoryFile(path: string): Promise<MemoryFile> {
  if (!existsSync(path)) {
    return { version: 1, updatedAt: Date.now(), nodes: [], links: [] };
  }
  try {
    const raw = JSON.parse(await readFile(path, "utf8")) as Partial<MemoryFile>;
    const nodes = Array.isArray(raw.nodes) ? (raw.nodes as MemoryNode[]) : [];
    const links = Array.isArray(raw.links) ? (raw.links as MemoryLink[]) : [];
    return {
      version: 1,
      updatedAt: typeof raw.updatedAt === "number" ? raw.updatedAt : Date.now(),
      nodes,
      links,
    };
  } catch {
    return { version: 1, updatedAt: Date.now(), nodes: [], links: [] };
  }
}

async function analyzeFileBasedMemory() {
  console.log("🔍 Analyzing File-Based Memory Store...");
  console.log("=" .repeat(50));
  
  const memoryBasePath = join(getUserConfigDir(), "opencode", "orchestrator-memory");
  console.log(`📁 Memory storage location: ${memoryBasePath}`);
  
  try {
    // Check if memory directory exists
    if (!existsSync(memoryBasePath)) {
      console.log("❌ Memory directory does not exist. No memory data stored yet.");
      return;
    }

    // Find all memory files
    const glob = new Glob("**/*.json");
    const memoryFiles: string[] = [];
    for await (const file of glob.scan(memoryBasePath)) {
      memoryFiles.push(file);
    }
    console.log(`📊 Found ${memoryFiles.length} memory files`);
    
    let totalNodes = 0;
    let totalLinks = 0;
    const allNodes: MemoryNode[] = [];
    const allLinks: MemoryLink[] = [];
    const scopeStats = new Map<string, number>();
    const projectStats = new Map<string, number>();
    const tagStats = new Map<string, number>();
    const keyPatterns = new Map<string, number>();

    // Analyze each memory file
    for (const filePath of memoryFiles) {
      const fullPath = join(memoryBasePath, filePath);
      const memoryData = await readMemoryFile(fullPath);
      
      console.log(`\n📄 ${filePath}:`);
      console.log(`   Nodes: ${memoryData.nodes.length}`);
      console.log(`   Links: ${memoryData.links.length}`);
      console.log(`   Last Updated: ${new Date(memoryData.updatedAt).toISOString()}`);
      
      totalNodes += memoryData.nodes.length;
      totalLinks += memoryData.links.length;
      allNodes.push(...memoryData.nodes);
      allLinks.push(...memoryData.links);

      // Analyze nodes
      memoryData.nodes.forEach(node => {
        // Scope distribution
        scopeStats.set(node.scope, (scopeStats.get(node.scope) || 0) + 1);
        
        // Project distribution
        if (node.projectId) {
          projectStats.set(node.projectId, (projectStats.get(node.projectId) || 0) + 1);
        }
        
        // Tag analysis
        node.tags.forEach(tag => {
          tagStats.set(tag, (tagStats.get(tag) || 0) + 1);
        });
        
        // Key pattern analysis
        const keyPattern = node.key.split(':')[0] || 'unknown';
        keyPatterns.set(keyPattern, (keyPatterns.get(keyPattern) || 0) + 1);
      });
    }

    console.log("\n" + "=".repeat(50));
    console.log("📈 OVERALL STATISTICS:");
    console.log("=" .repeat(50));
    console.log(`Total Nodes: ${totalNodes.toLocaleString()}`);
    console.log(`Total Links: ${totalLinks.toLocaleString()}`);
    console.log(`Total Files: ${memoryFiles.length}`);

    // 1. Node Types/Scope Distribution
    console.log("\n1️⃣ Node Scope Distribution:");
    console.log("-".repeat(30));
    const sortedScopes = Array.from(scopeStats.entries()).sort((a, b) => b[1] - a[1]);
    sortedScopes.forEach(([scope, count]) => {
      const percentage = ((count / totalNodes) * 100).toFixed(1);
      console.log(`  ${scope}: ${count.toLocaleString()} (${percentage}%)`);
    });

    // 2. Key Pattern Analysis
    console.log("\n2️⃣ Key Pattern Analysis:");
    console.log("-".repeat(30));
    const sortedPatterns = Array.from(keyPatterns.entries()).sort((a, b) => b[1] - a[1]);
    sortedPatterns.forEach(([pattern, count]) => {
      const percentage = ((count / totalNodes) * 100).toFixed(1);
      console.log(`  ${pattern}: ${count.toLocaleString()} (${percentage}%)`);
    });

    // 3. Project Activity
    if (projectStats.size > 0) {
      console.log("\n3️⃣ Project Activity (Top 10):");
      console.log("-".repeat(30));
      const sortedProjects = Array.from(projectStats.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10);
      sortedProjects.forEach(([projectId, count]) => {
        console.log(`  ${projectId}: ${count.toLocaleString()} entries`);
      });
    }

    // 4. Tag Analysis
    if (tagStats.size > 0) {
      console.log("\n4️⃣ Most Used Tags (Top 15):");
      console.log("-".repeat(30));
      const sortedTags = Array.from(tagStats.entries()).sort((a, b) => b[1] - a[1]).slice(0, 15);
      sortedTags.forEach(([tag, count]) => {
        console.log(`  ${tag}: ${count.toLocaleString()} times`);
      });
    }

    // 5. Sample Key Entities
    console.log("\n5️⃣ Sample Key Entities (Recent 15):");
    console.log("-".repeat(30));
    const recentNodes = allNodes
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
      .slice(0, 15);
    
    recentNodes.forEach((node, index) => {
      console.log(`\n  ${index + 1}. Key: ${node.key}`);
      console.log(`     Scope: ${node.scope}${node.projectId ? ` (Project: ${node.projectId})` : ''}`);
      console.log(`     Tags: [${node.tags.join(', ')}]`);
      console.log(`     Value: ${node.value.substring(0, 120)}${node.value.length > 120 ? '...' : ''}`);
      if (node.createdAt) {
        console.log(`     Created: ${new Date(node.createdAt).toISOString()}`);
      }
      if (node.updatedAt) {
        console.log(`     Updated: ${new Date(node.updatedAt).toISOString()}`);
      }
    });

    // 6. Relationship Analysis
    console.log("\n6️⃣ Relationship Analysis:");
    console.log("-".repeat(30));
    const relationshipTypes = new Map<string, number>();
    allLinks.forEach(link => {
      relationshipTypes.set(link.type, (relationshipTypes.get(link.type) || 0) + 1);
    });
    
    if (relationshipTypes.size > 0) {
      const sortedRelationships = Array.from(relationshipTypes.entries()).sort((a, b) => b[1] - a[1]);
      sortedRelationships.forEach(([type, count]) => {
        console.log(`  ${type}: ${count.toLocaleString()} links`);
      });
    } else {
      console.log("  No relationships found");
    }

    // 7. Key Relationships Sample
    if (allLinks.length > 0) {
      console.log("\n7️⃣ Sample Relationships (Recent 10):");
      console.log("-".repeat(30));
      const recentLinks = allLinks
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, 10);
      
      recentLinks.forEach((link, index) => {
        console.log(`  ${index + 1}. ${link.fromKey} → [${link.type}] → ${link.toKey}`);
      });
    }

    // 8. Notable Patterns
    console.log("\n8️⃣ Notable Patterns:");
    console.log("-".repeat(30));
    
    // Message vs Non-message distribution
    const messageNodes = allNodes.filter(n => n.key.startsWith('message:'));
    const summaryNodes = allNodes.filter(n => n.key.includes('summary'));
    const userNodes = allNodes.filter(n => n.tags.includes('user'));
    const projectNodes = allNodes.filter(n => n.tags.includes('project'));
    
    console.log(`  📨 Messages: ${messageNodes.length} (${((messageNodes.length / totalNodes) * 100).toFixed(1)}%)`);
    console.log(`  📋 Summaries: ${summaryNodes.length} (${((summaryNodes.length / totalNodes) * 100).toFixed(1)}%)`);
    console.log(`  👤 User entities: ${userNodes.length} (${((userNodes.length / totalNodes) * 100).toFixed(1)}%)`);
    console.log(`  📁 Project entities: ${projectNodes.length} (${((projectNodes.length / totalNodes) * 100).toFixed(1)}%)`);
    
    // Time range analysis
    const allTimestamps = allNodes
      .map(n => n.createdAt || n.updatedAt)
      .filter((ts): ts is number => ts !== undefined && ts > 0)
      .sort((a, b) => a - b);
    
    if (allTimestamps.length > 0) {
      const oldest = new Date(allTimestamps[0]);
      const newest = new Date(allTimestamps[allTimestamps.length - 1]);
      const daysSpan = (newest.getTime() - oldest.getTime()) / (1000 * 60 * 60 * 24);
      
      console.log(`\n  ⏰ Time Range: ${oldest.toISOString()} to ${newest.toISOString()}`);
      console.log(`     Span: ${daysSpan.toFixed(1)} days`);
    }

    console.log("\n✅ File-based memory analysis complete!");

  } catch (error) {
    console.error("❌ Error analyzing file-based memory:", error);
  }
}

// Run the analysis
if (import.meta.main) {
  analyzeFileBasedMemory();
}