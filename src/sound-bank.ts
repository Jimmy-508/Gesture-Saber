import type {SoundName} from './sound-design';
/** Replace URLs/version with sounds you own. Looping layers need seamless boundaries. */
export type SoundBank={id:string;version:string;files:Record<SoundName,string>};
export const DEFAULT_BANK:SoundBank={id:'gesture-energy',version:'1.3',files:{hum:'audio/hum.wav',soft:'audio/soft.wav',fast:'audio/fast.wav',ignite:'audio/ignite.wav',retract:'audio/retract.wav'}};
