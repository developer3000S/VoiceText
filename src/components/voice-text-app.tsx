
"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EncoderTab } from "@/components/encoder-tab";
import { DecoderTab } from "@/components/decoder-tab";
import { AudioWaveform, Link, Radio, Type, TestTube2 } from "lucide-react";
import { LogViewer } from "./log-viewer";
import { LogProvider } from "@/context/log-context";
import { ModemTab } from "./modem-tab";
import { ModemTestTab } from "./modem-test-tab";

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
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="encoder"><Type className="w-4 h-4 mr-2"/>Кодировщик</TabsTrigger>
                <TabsTrigger value="decoder"><Radio className="w-4 h-4 mr-2"/>Декодер</TabsTrigger>
                <TabsTrigger value="modem"><Link className="w-4 h-4 mr-2"/>Модем</TabsTrigger>
                <TabsTrigger value="modem-test"><TestTube2 className="w-4 h-4 mr-2"/>Тест модема</TabsTrigger>
              </TabsList>
              <TabsContent value="encoder">
                <EncoderTab />
              </TabsContent>
              <TabsContent value="decoder">
                <DecoderTab />
              </TabsContent>
              <TabsContent value="modem">
                 <ModemTab />
              </TabsContent>
               <TabsContent value="modem-test">
                 <ModemTestTab />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
        <LogViewer />
      </div>
    </LogProvider>
  );
}
