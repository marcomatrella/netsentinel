# NetSentinel Home Assistant Add-on

**Intelligent Home Lab & Small Network Monitoring with Topology-Aware Root Cause Analysis**

NetSentinel doesn't just flood you with redundant "Device X is down" alerts. It understands the physical and logical topology of your network and tells you **exactly what failed, why, when, and what action to take**.

---

## 🌟 Key Capabilities
- 🗺️ **Interactive Topology Canvas**: Drag-and-drop hardware nodes and links on a modern canvas with auto-dependency deduction (PoE power, Layer 2 paths, Layer 3 gateway, DNS, DHCP).
- 🧠 **Root Cause Analysis (Zero Alert Storm)**: If an upstream core switch or router goes down, downstream devices are identified as `UNREACHABLE` rather than triggering dozens of false-alarm notifications.
- ⏱️ **Historical Time Machine**: Rewind time across historical snapshots (up to 30 days) to replay network events, outages, and state changes.
- 🛠️ **Scheduled Maintenance**: Plan one-off or recurring daily/weekly maintenance intervals (alarms and notifications are suppressed while keeping devices visible).
- 🔕 **Passive Tracking for End Clients**: Laptops, smartphones, and IoT devices are monitored passively without spamming alerts when they go into standby or disconnect.
- ⚡ **Lightweight & SSD-Friendly**: Built with SQLite WAL mode, asynchronous batching, and low resource overhead (< 200MB RAM).

---

## 🚀 Installation & Setup

1. In Home Assistant, open **Settings** ➔ **Add-ons** ➔ **Add-on Store**.
2. Click the three dots (**⋮**) in the top right corner ➔ **Repositories**.
3. Add the NetSentinel repository:
   ```text
   https://github.com/marcomatrella/netsentinel
   ```
4. Find **NetSentinel** in the Add-on Store, click **Install**, and then **Start**.
5. Enable the **"Show in sidebar"** toggle to access NetSentinel directly from Home Assistant's left navigation menu!

---

## ⚙️ Configuration Options

Navigate to the **Configuration** tab in the add-on page to customize these settings:

| Option | Type | Default | Description |
|---|---|---|---|
| `port` | `port` | `8181` | Port used to expose NetSentinel's Web UI and API. Change this if `8181` conflicts with other add-ons or services on your Home Assistant host (e.g. `8182`, `9090`). |
| `subnet` | `string` | `""` (empty) | Local network CIDR for discovery sweeps (e.g. `192.168.1.0/24` or `10.0.0.0/24`). If left empty, NetSentinel will auto-detect the local subnet of your Home Assistant host. |
| `timezone` | `string` | `"Europe/Rome"` | Timezone identifier (e.g. `Europe/Rome`, `America/New_York`, `UTC`). Used for Time Machine navigation, scheduled maintenance intervals, and log timestamps. |
| `auth_enabled` | `boolean` | `false` | Enable or disable NetSentinel's internal standalone authentication. Set to `false` when accessing via Home Assistant Ingress for seamless single sign-on. |

### Example Configuration:
```yaml
port: 8181
subnet: "192.168.1.0/24"
timezone: "Europe/Rome"
auth_enabled: false
```

---

## 🌐 Network Access & Privileges

This add-on is configured with:
- **`host_network: true`**: Required to allow NetSentinel to perform local Layer 2 ARP sweeps and broadcast device discovery on your physical LAN.
- **`NET_ADMIN` & `NET_RAW` Capabilities**: Allows raw, low-overhead ICMP ping measurements without requiring root privileges.
- **Home Assistant Ingress**: Access NetSentinel seamlessly inside Home Assistant through the left sidebar without exposing separate ports externally.
- **Direct LAN Access**: You can also reach NetSentinel directly via `http://<HOME_ASSISTANT_IP>:<CONFIGURED_PORT>`.

---

## 💾 Backing Up & Migrating Your Data

If you are migrating from another installation (e.g. Synology NAS, Docker Compose, or PC):
1. In your existing NetSentinel instance, open **Settings / Backup** and click **Download JSON**.
2. In your Home Assistant NetSentinel instance, open the onboarding wizard or Settings and click **Restore JSON**.
3. All devices, layout positions, custom colors, and connections will be restored instantly!
