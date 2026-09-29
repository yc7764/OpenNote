"use client";
import { useState } from 'react';

export function useNoteEditing() {
  const [editingSegmentId, setEditingSegmentId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [isEditingMainTopic, setIsEditingMainTopic] = useState(false);
  const [editingMainTopicText, setEditingMainTopicText] = useState('');
  const [isEditingNextAction, setIsEditingNextAction] = useState(false);
  const [editingNextActionText, setEditingNextActionText] = useState('');
  const [isEditingKeywords, setIsEditingKeywords] = useState(false);
  const [editingKeywordsText, setEditingKeywordsText] = useState('');
  const [editingSection, setEditingSection] = useState<{
    order: number | null;
    field: 'title' | 'content' | null;
  }>({ order: null, field: null });
  const [editingSectionText, setEditingSectionText] = useState('');

  return {
    editingSegmentId, setEditingSegmentId,
    editingText, setEditingText,
    isEditingMainTopic, setIsEditingMainTopic,
    editingMainTopicText, setEditingMainTopicText,
    isEditingNextAction, setIsEditingNextAction,
    editingNextActionText, setEditingNextActionText,
    isEditingKeywords, setIsEditingKeywords,
    editingKeywordsText, setEditingKeywordsText,
    editingSection, setEditingSection,
    editingSectionText, setEditingSectionText,
  };
}
