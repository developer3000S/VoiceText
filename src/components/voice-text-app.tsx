"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EncoderTab } from "@/components/encoder-tab";
import { DecoderTab } from "@/components/decoder-tab";
import { ManualDecoderTab } from "@/components/manual-decoder-tab";
import { AudioWaveform } from "lucide-react";

export function VoiceTextApp() {
  return (
    <Card className="w-full shadow-2xl bg-card">
      <CardHeader className="text-center">
        <div className="flex items-center justify-center gap-3">
          <AudioWaveform className="h-8 w-8 text-primary" />
          <CardTitle className="text-3xl font-bold">VoiceText</CardTitle>
        </div>
        <CardDescription>
          Transmit text over voice calls using DTMF tones.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="encoder" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="encoder">Encoder</TabsTrigger>
            <TabsTrigger value="decoder">Decoder</TabsTrigger>
            <TabsTrigger value="manual">Manual</TabsTrigger>
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
  );
}
