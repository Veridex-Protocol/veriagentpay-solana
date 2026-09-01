'use client';

import React, { useState } from 'react';
import { Modal } from './ui/Modal';
import { Input } from './ui/Input';
import { Button } from './ui/Button';
import { useCreateContact } from '../hooks/use-contacts';
import { useTheme } from './providers/ThemeProvider';
import { User, MessageCircle, Phone, MessageSquare, Hash } from 'lucide-react';

export interface AddContactModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const AddContactModal: React.FC<AddContactModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const [name, setName] = useState('');
  const [platform, setPlatform] = useState<'telegram' | 'whatsapp' | 'discord' | 'slack' | 'phone'>('telegram');
  const [identifier, setIdentifier] = useState('');
  const [error, setError] = useState('');

  const createContactMutation = useCreateContact();

  const platformPlaceholders = {
    telegram: '@username (e.g. @alice)',
    whatsapp: '+15551234567',
    discord: '@username (e.g. @bob_dev)',
    slack: '@username or U123456',
    phone: '+15551234567',
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Contact display name is required');
      return;
    }
    if (!identifier.trim()) {
      setError('Platform identifier is required');
      return;
    }

    setError('');
    try {
      await createContactMutation.mutateAsync({
        name: name.trim(),
        platform,
        identifier: identifier.trim(),
      });

      setName('');
      setIdentifier('');
      if (onSuccess) onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to create contact');
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add New Contact">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-xs text-red-500 font-semibold">
            {error}
          </div>
        )}

        <Input
          label="Display Name"
          placeholder="e.g. Alice Smith"
          value={name}
          onChange={(e) => setName(e.target.value)}
          leftIcon={<User className="w-4 h-4" />}
        />

        <div className="space-y-2">
          <label className={`text-xs font-semibold uppercase tracking-wider block ${
            isDark ? 'text-slate-400' : 'text-slate-600'
          }`}>Platform</label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { id: 'telegram', label: 'Telegram', icon: MessageCircle },
              { id: 'whatsapp', label: 'WhatsApp', icon: Phone },
              { id: 'discord', label: 'Discord', icon: MessageSquare },
              { id: 'slack', label: 'Slack', icon: Hash },
              { id: 'phone', label: 'Phone', icon: Phone },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setPlatform(item.id as any)}
                  className={`p-2.5 rounded-xl border flex items-center justify-center gap-1.5 text-xs font-bold transition-all ${
                    platform === item.id
                      ? 'bg-[#F2D827]/15 border-[#F2D827] text-[#D4A106] dark:text-[#F2D827] shadow-sm'
                      : isDark
                        ? 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:text-slate-950'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <Input
          label="Platform Identifier"
          placeholder={platformPlaceholders[platform]}
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
        />

        <div className="flex gap-3 pt-2">
          <Button type="button" variant="ghost" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            className="flex-1"
            isLoading={createContactMutation.isPending}
          >
            Save Contact
          </Button>
        </div>
      </form>
    </Modal>
  );
};
