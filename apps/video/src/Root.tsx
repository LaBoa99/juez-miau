import { Composition } from "remotion";
import { JuezMiau } from "./JuezMiau";

export const RemotionRoot: React.FC = () => (
  <Composition id="JuezMiau" component={JuezMiau} durationInFrames={2700} fps={30} width={1920} height={1080} />
);
