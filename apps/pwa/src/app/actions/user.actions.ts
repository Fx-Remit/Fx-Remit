'use server';

import { prisma } from '@fx-remit/database';

export async function getMe(privyDid: string) {
  if (!privyDid) return null;
  
  try {
    const user = await prisma.user.findUnique({
      where: { privyDid },
    });
    return user;
  } catch (error) {
    console.error('getMe error:', error);
    return null;
  }
}

export async function updateProfile(privyDid: string, data: { fullName?: string; displayName?: string; avatarUrl?: string }) {
  if (!privyDid) return null;

  try {
    const user = await prisma.user.update({
      where: { privyDid },
      data,
    });
    return user;
  } catch (error) {
    console.error('updateProfile error:', error);
    return null;
  }
}
