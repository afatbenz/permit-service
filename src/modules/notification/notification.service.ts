import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Notification } from '../../database/models/notification.model';

@Injectable()
export class NotificationService {
  constructor(
    @InjectModel(Notification) private readonly notificationModel: typeof Notification,
  ) {}

  /**
   * Bulk-create notifications for multiple recipients. Used by the
   * join-by-code flow to alert every org admin of a pending request.
   */
  async notify(
    recipientIds: string[],
    data: {
      organizationId: string;
      type: string;
      title: string;
      message: string;
      data?: Record<string, unknown>;
      createdBy: string;
    },
  ) {
    if (!recipientIds.length) {
      return [];
    }
    const rows = recipientIds.map((recipientId) => ({
      organizationId: data.organizationId,
      recipientId,
      type: data.type,
      title: data.title,
      message: data.message,
      data: data.data ?? null,
      createdBy: data.createdBy,
    }));
    return this.notificationModel.bulkCreate(rows);
  }

  /** A user's notifications, unread first, newest first. */
  async listForUser(userId: string) {
    const notifications = await this.notificationModel.findAll({
      where: { recipientId: userId },
      order: [
        ['isRead', 'ASC'],
        ['createdAt', 'DESC'],
      ],
      limit: 50,
    });
    return {
      notifications: notifications.map((n) => n.toJSON()),
      unreadCount: notifications.filter((n) => !n.isRead).length,
    };
  }

  /** Marks one of the user's own notifications as read. */
  async markRead(id: string, userId: string) {
    const notification = await this.notificationModel.findOne({
      where: { id, recipientId: userId },
    });
    if (!notification) {
      throw new NotFoundException('Notifikasi tidak ditemukan');
    }
    await notification.update({ isRead: true });
    return { message: 'Notifikasi ditandai sudah dibaca', id };
  }
}
