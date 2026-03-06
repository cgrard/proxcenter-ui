/** File-based storage types that support PVE download-url API */
export const FILE_BASED_STORAGE_TYPES = ["dir", "nfs", "cifs", "glusterfs", "cephfs", "btrfs"] as const

export function isFileBasedStorage(type: string): boolean {
  return FILE_BASED_STORAGE_TYPES.includes(type as any)
}

/** Storage types that support VM disk images (content type "images") */
export const VM_DISK_STORAGE_TYPES = ["dir", "nfs", "cifs", "glusterfs", "btrfs", "rbd", "lvm", "lvmthin", "zfspool", "zfs"] as const

export function supportsVmDisks(type: string): boolean {
  return VM_DISK_STORAGE_TYPES.includes(type as any)
}
