// The Bluetooth connection of a subwoofer, or of a group's member
// subwoofers together: what the badge says, and what a tap on the driver does.

export interface Connection {
  // How many are connected, of how many
  on: number;
  of: number;
  label: string;
  // All connected, some, or none
  all: boolean;
  some: boolean;
}

/** The badge's status for the connection sensors' states (true: connected). */
export function connectionOf(connected: boolean[]): Connection {
  const of = connected.length, on = connected.filter(Boolean).length;
  const all = of > 0 && on === of, some = on > 0 && !all, group = of > 1;
  const label = all ? (group ? "All connected" : "Connected")
    : some ? `${on} of ${of} connected` : (group ? "None connected" : "Not connected");
  return { on, of, label, all, some };
}

/**
 * The subwoofers a tap on the driver acts on, and how: when all are
 * connected, each one is disconnected; otherwise those not connected are
 * reconnected (Reconnect would drop a live connection first).
 */
export function connectionTargets(sensors: { id: string; connected: boolean }[]): { action: "disconnect" | "reconnect"; ids: string[] } {
  const all = sensors.length > 0 && sensors.every((s) => s.connected);
  return all
    ? { action: "disconnect", ids: sensors.map((s) => s.id) }
    : { action: "reconnect", ids: sensors.filter((s) => !s.connected).map((s) => s.id) };
}
