'use server';

import { prisma } from '@fx-remit/database';

export async function getMe(privyDid: string) {
  if (!privyDid) return null;
  
  try {
    const user = await prisma.user.findUnique({
      where: { privyDid },
    });
    
    if (!user) return null;

    return {
      ...user,
      totalSentUsd: user.totalSentUsd ? Number(user.totalSentUsd) : 0,
    };
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
    
    return {
      ...user,
      totalSentUsd: user.totalSentUsd ? Number(user.totalSentUsd) : 0,
    };
  } catch (error) {
    console.error('updateProfile error:', error);
    return null;
  }
}
