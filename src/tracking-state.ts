// One policy shared by identity retention, pose freeze, blade animation and visibility.
export const TRACKING={staleMs:180,retractMs:260,hideMs:420} as const;
export type HandStatus='TRACKED'|'TEMPORARILY_LOST'|'LOST';
