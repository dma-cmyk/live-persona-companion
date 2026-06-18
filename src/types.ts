export interface Persona {
  id: string;
  name: string;
  description: string;
  systemInstruction: string;
  voiceName: "Zephyr" | "Puck" | "Charon" | "Kore" | "Fenrir" | "Leda" | "Orus" | "Aoede" | "Callirrhoe" | "Autonoe" | "Enceladus" | "Iapetus" | "Umbriel" | "Algieba" | "Despina" | "Erinome" | "Algenib" | "Rasalgethi" | "Laomedeia" | "Achernar" | "Alnilam" | "Schedar" | "Gacrux" | "Pulcherrima" | "Achird" | "Zubenelgenubi" | "Vindemiatrix" | "Sadachbia" | "Sadaltager" | "Sulafat";
  isDefault?: boolean;
  icon?: string;
}

export interface TranscriptItem {
  id: string;
  sender: "user" | "model";
  text: string;
  timestamp: Date;
}

export type ConnectionStatus =
  | "disconnected"
  | "connecting"
  | "setup"
  | "connected"
  | "error";
