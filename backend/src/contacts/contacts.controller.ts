import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Headers,
  NotFoundException,
} from '@nestjs/common';
import { ContactsService, CreateContactDto, UpdateContactDto } from './contacts.service';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WalletAddress } from '../auth/decorators/wallet-address.decorator';

@Controller('api/contacts')
export class ContactsController {
  constructor(
    private readonly contactsService: ContactsService,
    private readonly prisma: PrismaService,
  ) {}

  private async resolveUserId(walletAddress: string): Promise<string> {
    if (!walletAddress) throw new NotFoundException('Wallet address required');

    const user = await this.prisma.user.findFirst({
      where: {
        smartWallet: {
          address: { equals: walletAddress, mode: 'insensitive' as Prisma.QueryMode },
        },
      },
    });

    if (!user) throw new NotFoundException('User not found for this wallet address');
    return user.id;
  }

  @Get()
  async getContacts(@WalletAddress() walletAddress: string) {
    const userId = await this.resolveUserId(walletAddress);
    const contacts = await this.contactsService.findAllForUser(userId);
    return { contacts };
  }

  @Post()
  async createContact(
    @WalletAddress() walletAddress: string,
    @Body() dto: CreateContactDto
  ) {
    const userId = await this.resolveUserId(walletAddress);
    const contact = await this.contactsService.create(userId, dto);
    return { success: true, contact };
  }

  @Patch(':id')
  async updateContact(
    @Param('id') id: string,
    @WalletAddress() walletAddress: string,
    @Body() dto: UpdateContactDto
  ) {
    const userId = await this.resolveUserId(walletAddress);
    const contact = await this.contactsService.update(userId, id, dto);
    return { success: true, contact };
  }

  @Delete(':id')
  async deleteContact(
    @Param('id') id: string,
    @WalletAddress() walletAddress: string
  ) {
    const userId = await this.resolveUserId(walletAddress);
    await this.contactsService.remove(userId, id);
    return { success: true };
  }
}
