import { Shell } from "@/components/shell";

export function App() {
  return (
    <Shell>
      <div className="p-8">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground mt-2">Workers will appear here</p>
      </div>
    </Shell>
  );
}
