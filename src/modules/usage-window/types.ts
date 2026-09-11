/** Mirror of `UsageWindowSnapshot` in server/modules/usage-window. */
export type UsageWindowReading = {
  /** 0-100. */
  porcentaje: number;
  /** epoch ms when the window resets, or null when the SDK didn't send one. */
  resetsAt: number | null;
  /** epoch ms: when the server recorded this reading. */
  leidoEn: number;
};

export type UsageWindowSnapshot = {
  kind: 'usage_window';
  fiveHour: UsageWindowReading | null;
  sevenDay: UsageWindowReading | null;
};
