import type { Teacher } from '../db'
import { fakeSupabase } from './fakeSupabase'

/** Registers a teacher on the fake server and signs the device in as them. */
export function signInTeacher(
  name = 'Amanda',
  password = 'Bio Room 214!',
): Teacher & { password: string } {
  const fake = fakeSupabase()
  const username = name.toLowerCase()
  const user = fake.addUser({ username, password, displayName: name })
  fake.signInAs(user)
  return { id: user.id, username, displayName: name, password }
}

/** Registers a teacher without changing who is signed in. */
export function registerTeacher(
  name: string,
  password = 'Bio Room 214!',
): Teacher & { password: string } {
  const fake = fakeSupabase()
  const username = name.toLowerCase()
  const user = fake.addUser({ username, password, displayName: name })
  return { id: user.id, username, displayName: name, password }
}

/** Switches the signed-in teacher, as signing out and back in as someone else would. */
export function switchTo(teacher: { id: string }): void {
  const fake = fakeSupabase()
  const user = fake.users.find((u) => u.id === teacher.id)
  if (!user) throw new Error(`No such teacher ${teacher.id}`)
  fake.signInAs(user)
}
