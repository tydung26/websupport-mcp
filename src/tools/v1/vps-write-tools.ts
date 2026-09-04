import { z } from 'zod'
import { confirmArg } from '../confirm.js'
import { type AnyToolDef, defineTool } from '../types.js'
import { userIdArg, userPath } from './common.js'

/**
 * VPS power operations and the snapshot lifecycle.
 *
 * `ws_vps_snapshot_list` is tier `read` even though it lives here — a read-only
 * deployment should be able to see what snapshots exist without being able to
 * create, restore or delete one. Keeping it beside the rest of the lifecycle
 * beats splitting the module for the sake of tidiness.
 *
 * Tiering follows what the operation destroys, not whether it writes:
 *  - graceful reboot and snapshot create are recoverable — `write`
 *  - hard reboot is an unclean power cycle that can corrupt in-flight writes
 *  - snapshot restore discards every change since the snapshot
 *  - snapshot delete throws away a recovery point
 */

const vpsIdArg = z.string().min(1).describe('VPS id or name, as returned by ws_vps_list.')
const snapshotNameArg = z
  .string()
  .min(1)
  .describe('Snapshot name, as returned by ws_vps_snapshot_list.')

function vpsPath(userId: string, vpsId: string, suffix: string): string {
  return userPath(userId, `/vps/${encodeURIComponent(vpsId)}${suffix}`)
}

function snapshotPath(userId: string, vpsId: string, name?: string): string {
  return vpsPath(userId, vpsId, name ? `/snapshot/${encodeURIComponent(name)}` : '/snapshot')
}

export const vpsWriteTools: AnyToolDef[] = [
  defineTool({
    name: 'ws_vps_reboot',
    title: 'Reboot VPS',
    description:
      'Gracefully reboot a VPS. The guest operating system is asked to shut down cleanly first, so running services stop in an orderly way. The machine is unreachable while it restarts.',
    tier: 'write',
    inputSchema: z.strictObject({ userId: userIdArg, vpsId: vpsIdArg }),
    handler: async ({ userId, vpsId }, ctx) => {
      const { status } = await ctx.request({
        method: 'PUT',
        path: vpsPath(userId, vpsId, '/reboot'),
      })
      return { status, rebooting: true }
    },
  }),

  defineTool({
    name: 'ws_vps_hard_reboot',
    title: 'Hard reboot VPS',
    description:
      'Force a VPS to power-cycle without letting the guest shut down. Equivalent to pulling the power cable: writes still in flight are lost and filesystems or databases can be left corrupted. Use ws_vps_reboot unless the machine is already unresponsive.',
    tier: 'destructive',
    // Every call is another power cut, so this one does not converge.
    idempotent: false,
    inputSchema: z.strictObject({ userId: userIdArg, vpsId: vpsIdArg, ...confirmArg }),
    handler: async ({ userId, vpsId }, ctx) => {
      const { status } = await ctx.request({
        method: 'PUT',
        path: vpsPath(userId, vpsId, '/hard-reboot'),
      })
      return { status, rebooting: true }
    },
  }),

  defineTool({
    name: 'ws_vps_snapshot_list',
    title: 'List VPS snapshots',
    // Tier read on purpose — see the module comment.
    description: 'List the snapshots taken of a VPS, with their names and creation times.',
    tier: 'read',
    inputSchema: z.strictObject({ userId: userIdArg, vpsId: vpsIdArg }),
    handler: async ({ userId, vpsId }, ctx) =>
      (await ctx.request({ method: 'GET', path: snapshotPath(userId, vpsId) })).body,
  }),

  defineTool({
    name: 'ws_vps_snapshot_create',
    title: 'Create VPS snapshot',
    description:
      'Take a snapshot of a VPS disk, so its current state can be restored later. Snapshots consume storage against the account.',
    tier: 'write',
    inputSchema: z.strictObject({
      userId: userIdArg,
      vpsId: vpsIdArg,
      name: z.string().min(1).describe('Name to give the snapshot.'),
    }),
    handler: async ({ userId, vpsId, name }, ctx) => {
      const { status, body } = await ctx.request({
        method: 'POST',
        path: snapshotPath(userId, vpsId),
        body: { name },
      })
      return { status, snapshot: body }
    },
  }),

  defineTool({
    name: 'ws_vps_snapshot_restore',
    title: 'Restore VPS snapshot',
    description:
      'Overwrite the VPS disk with the named snapshot. All data written since that snapshot was taken is permanently lost — databases, uploads, logs and configuration changes alike. There is no undo. Take a fresh snapshot first if the current state matters at all.',
    tier: 'destructive',
    inputSchema: z.strictObject({
      userId: userIdArg,
      vpsId: vpsIdArg,
      name: snapshotNameArg,
      ...confirmArg,
    }),
    handler: async ({ userId, vpsId, name }, ctx) => {
      const { status } = await ctx.request({
        method: 'POST',
        path: snapshotPath(userId, vpsId, name),
      })
      return { status, restoring: true }
    },
  }),

  defineTool({
    name: 'ws_vps_snapshot_delete',
    title: 'Delete VPS snapshot',
    description:
      'Permanently delete a VPS snapshot. The recovery point is destroyed and the disk state it held can no longer be restored. The running VPS is unaffected.',
    tier: 'destructive',
    inputSchema: z.strictObject({
      userId: userIdArg,
      vpsId: vpsIdArg,
      name: snapshotNameArg,
      ...confirmArg,
    }),
    handler: async ({ userId, vpsId, name }, ctx) => {
      const { status } = await ctx.request({
        method: 'DELETE',
        path: snapshotPath(userId, vpsId, name),
      })
      return { status, deleted: true }
    },
  }),
]
