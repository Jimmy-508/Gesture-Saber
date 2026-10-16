// Shared hand tracking types. Activation depends on reliable identity, never finger shape.
export type Point={x:number;y:number;z:number};
export type Side='Left'|'Right';
// open remains for archived benchmark fixtures; the live scene deliberately ignores it.
export type Pose={side:Side;points:Point[];world?:Point[];open:boolean;time:number;imageAspect?:number};
