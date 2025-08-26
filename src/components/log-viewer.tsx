"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useLog } from "@/context/log-context";
import { Terminal, Trash2 } from "lucide-react";
import { Button } from "./ui/button";

export function LogViewer() {
  const { logs, clearLogs } = useLog();

  return (
    <Card className="shadow-lg bg-card">
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="flex items-center gap-3">
          <Terminal className="h-6 w-6 text-primary" />
          <div >
            <CardTitle className="text-xl">Логи</CardTitle>
            <CardDescription>Журнал действий и ошибок приложения</CardDescription>
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={clearLogs} disabled={logs.length === 0}>
          <Trash2 className="h-5 w-5" />
          <span className="sr-only">Очистить логи</span>
        </Button>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-48 w-full rounded-md border bg-muted/20 p-4">
          {logs.length === 0 ? (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              <p>Здесь будут отображаться логи...</p>
            </div>
          ) : (
            <div className="space-y-2">
              {logs.map((log) => (
                <div key={log.id} className="font-mono text-sm flex items-start">
                  <span className="text-muted-foreground mr-2">[{log.timestamp}]</span>
                  <span className={`mr-2 font-bold ${log.type === 'error' ? 'text-destructive' : 'text-primary'}`}>
                    [{log.type.toUpperCase()}]
                  </span>
                  <p className="break-all flex-1">{log.message}</p>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}