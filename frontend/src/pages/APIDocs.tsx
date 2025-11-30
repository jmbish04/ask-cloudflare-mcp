import SwaggerUI from "swagger-ui-react";
import "swagger-ui-react/swagger-ui.css";
import { Card, CardBody } from "@heroui/react";

export const APIDocs = () => {
  // Use the injected environment variable or fallback to window location
  const workerUrl = import.meta.env.VITE_WORKER_URL || window.location.origin;
  
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">API Documentation</h2>
      <Card className="bg-white dark:bg-white"> 
        {/* Force white background because SwaggerUI themes are light by default */}
        <CardBody>
          <SwaggerUI url={`${workerUrl}/openapi.json`} />
        </CardBody>
      </Card>
    </div>
  );
};

