import { Composition } from "remotion";
import { JuezMiau } from "./JuezMiau";
import { TUTORIALES } from "./tutoriales";
import { Tutorial, duracion } from "./tutoriales/Tutorial";

export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="JuezMiau" component={JuezMiau} durationInFrames={2700} fps={30} width={1920} height={1080} />
    {TUTORIALES.map((d) => (
      <Composition key={d.id} id={`tutorial-${d.id}`} component={Tutorial} defaultProps={{ datos: d }} durationInFrames={duracion(d)} fps={30} width={1920} height={1080} />
    ))}
  </>
);
