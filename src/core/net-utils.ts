import { createConnection, createServer, type Server } from "node:net";

export interface HealthCheckResponse {
  status: 'healthy' | 'unhealthy';
  timestamp: number;
  workerId?: string;
  memory?: number;
  cpu?: number;
}

export class WorkerHealthChecker {
  private healthServer: Server | null = null;
  private healthPort: number = 0;
  
  async startHealthServer(port: number): Promise<void> {
    this.healthPort = port;
    
    return new Promise((resolve, reject) => {
      this.healthServer = createServer((socket) => {
        socket.on('data', (data) => {
          try {
            const request = JSON.parse(data.toString());
            
            if (request.type === 'health_check') {
              const response: HealthCheckResponse = {
                status: 'healthy',
                timestamp: Date.now(),
                workerId: request.workerId
              };
              
              socket.write(JSON.stringify(response));
            }
          } catch {
            socket.destroy();
          }
        });
        
        socket.on('close', () => {
          // Clean up connection tracking
        });
        
        socket.on('error', () => {});
      });

      this.healthServer.listen(port, '127.0.0.1', () => {
        resolve();
      });

      this.healthServer.on('error', (error) => {
        reject(error);
      });
    });
  }
  
  async checkWorkerHealth(workerId: string, port: number, timeout: number = 5000): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = createConnection({ host: '127.0.0.1', port }, () => {
        const healthRequest = {
          type: 'health_check',
          workerId,
          timestamp: Date.now()
        };
        
        socket.write(JSON.stringify(healthRequest));
      });
      
      let responded = false;
      
      socket.on('data', (data) => {
        responded = true;
        try {
          const response: HealthCheckResponse = JSON.parse(data.toString());
          socket.destroy();
          resolve(response.status === 'healthy');
        } catch {
          resolve(false);
        }
      });
      
      socket.on('error', () => {
        if (!responded) resolve(false);
      });
      
      socket.on('timeout', () => {
        socket.destroy();
        resolve(false);
      });
      
      socket.setTimeout(timeout);
    });
  }
  
  async stopHealthServer(): Promise<void> {
    return new Promise((resolve) => {
      if (this.healthServer) {
        this.healthServer.close(() => {
          this.healthServer = null;
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
  
  getHealthPort(): number {
    return this.healthPort;
  }
}
