import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  listUsers() {
    // Ordered purely by signup time, not status -- sorting by status meant
    // approving/rejecting/disabling someone physically jumped their row to a
    // different part of the list (e.g. disabling an APPROVED user sent them
    // to the bottom, alphabetically after REJECTED), which is disorienting
    // mid-review. Row position now only ever reflects when they signed up.
    return this.prisma.user.findMany({
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        email: true,
        name: true,
        picture: true,
        status: true,
        role: true,
        createdAt: true,
        approvedAt: true,
      },
    });
  }

  async approve(id: string) {
    await this.ensureExists(id);
    return this.prisma.user.update({ where: { id }, data: { status: 'APPROVED', approvedAt: new Date() } });
  }

  async reject(id: string) {
    await this.ensureExists(id);
    // approvedAt is deliberately left untouched here (only ever set by
    // approve()) -- it now doubles as "has this user ever been approved",
    // which the frontend uses to decide whether to keep showing the
    // enable/disable switch instead of reverting to Approve/Reject buttons.
    return this.prisma.user.update({ where: { id }, data: { status: 'REJECTED' } });
  }

  private async ensureExists(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('user not found');
    return user;
  }
}
