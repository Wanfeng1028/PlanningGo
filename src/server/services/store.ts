import { memories, reservations, shareRooms } from "../data/mockData";
import type { MemoryItem, Reservation, ShareRoom } from "../types";

const reservationStore = new Map(reservations.map((item) => [item.id, item]));
const shareStore = new Map(shareRooms.map((item) => [item.id, item]));
const memoryStore = new Map(memories.map((item) => [item.id, item]));

export function listReservations() {
  return Array.from(reservationStore.values());
}

export function upsertReservation(input: Omit<Reservation, "id"> & { id?: string }) {
  const id = input.id ?? `res_${Date.now()}`;
  const reservation: Reservation = { ...input, id };
  reservationStore.set(id, reservation);
  return reservation;
}

export function updateReservationStatus(id: string, status: Reservation["status"]) {
  const reservation = reservationStore.get(id);
  if (!reservation) return null;
  const next = { ...reservation, status };
  reservationStore.set(id, next);
  return next;
}

export function listShareRooms() {
  return Array.from(shareStore.values());
}

export function createShareRoom(input: Omit<ShareRoom, "id"> & { id?: string }) {
  const id = input.id ?? `share_${Date.now()}`;
  const room: ShareRoom = { ...input, id };
  shareStore.set(id, room);
  return room;
}

export function vote(roomId: string, memberName: string, value: "yes" | "no", comment?: string) {
  const room = shareStore.get(roomId);
  if (!room) return null;
  const members = room.members.map((member) =>
    member.name === memberName ? { ...member, vote: value, comment: comment ?? member.comment } : member,
  );
  const next = { ...room, members };
  shareStore.set(roomId, next);
  return next;
}

export function listMemories() {
  return Array.from(memoryStore.values());
}

export function upsertMemory(input: Omit<MemoryItem, "id"> & { id?: string }) {
  const id = input.id ?? `mem_${Date.now()}`;
  const memory: MemoryItem = { ...input, id };
  memoryStore.set(id, memory);
  return memory;
}

export function deleteMemory(id: string) {
  return memoryStore.delete(id);
}
