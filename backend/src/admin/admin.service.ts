import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  listUsers() {
    return this.prisma.user.findMany({
      orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
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
    return this.prisma.user.update({ where: { id }, data: { status: 'REJECTED', approvedAt: null } });
  }

  private async ensureExists(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('user not found');
    return user;
  }
}
