
"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EncoderTab } from "@/components/encoder-tab";
import { DecoderTab } from "@/components/decoder-tab";
import { ManualDecoderTab } from "@/components/manual-decoder-tab";
import { AudioWaveform, Terminal } from "lucide-react";
import { useState } from "react";
import { LogViewer } from "./log-viewer";
import { LogProvider } from "@/context/log-context";

export function VoiceTextApp() {
  return (
    <LogProvider>
       <div className="space-y-4">
        <Card className="w-full shadow-2xl bg-card">
          <CardHeader className="text-center">
            <div className="flex items-center justify-center gap-3">
              <AudioWaveform className="h-8 w-8 text-primary" />
              <CardTitle className="text-3xl">
                <span className="font-normal">Голосовой</span> <span className="font-bold">Текст</span>
              </CardTitle>
            </div>
            <CardDescription>
              Передавайте текст во время голосовых вызовов с помощью тонов DTMF.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="encoder" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="encoder">Кодировщик</TabsTrigger>
                <TabsTrigger value="decoder">Декодер</TabsTrigger>
                <TabsTrigger value="manual">DTMF вручную</TabsTrigger>
              </TabsList>
              <TabsContent value="encoder">
                <EncoderTab />
              </TabsContent>
              <TabsContent value="decoder">
                <DecoderTab />
              </TabsContent>
              <TabsContent value="manual">
                <ManualDecoderTab />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
        <LogViewer />
      </div>
    </LogProvider>
  );
}
