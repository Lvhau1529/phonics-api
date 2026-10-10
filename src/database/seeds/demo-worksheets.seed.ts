import { type PrismaClient } from '../../generated/prisma/client';
import { DEMO_TEACHER1 } from './demo.constants';

/**
 * Phiếu bài tập mẫu (SEED_DEMO): 4 câu SHARED đã phát hành (không cần media) + 1 phiếu "Letter Nn — Demo" đã phát hành,
 * thuộc teacher1@demo.local. Bỏ qua nếu đã có. Giao bài thì làm trên admin (cần chọn lớp / ngày).
 */
export async function seedDemoWorksheets(prisma: PrismaClient): Promise<void> {
  const teacher = await prisma.user.findUnique({ where: { email: DEMO_TEACHER1 }, select: { id: true } });
  if (!teacher) return;
  if (await prisma.worksheet.findFirst({ where: { title: 'Letter Nn — Demo' }, select: { id: true } })) {
    console.log('[seed] worksheet demo: đã có — bỏ qua');
    return;
  }
  const common = {
    status: 'PUBLISHED' as const,
    visibility: 'SHARED' as const,
    createdById: teacher.id,
    tags: ['nn', 'week-9'],
  };
  const questions = await prisma.$transaction([
    prisma.question.create({
      data: {
        ...common,
        type: 'MULTIPLE_CHOICE',
        gradingMode: 'AUTO',
        instruction: 'Circle the correct word.',
        instructionVi: 'Khoanh từ đúng',
        config: {
          type: 'MULTIPLE_CHOICE',
          prompt: 'Which word has the sound /n/?',
          options: [
            { id: 'a', text: 'nest' },
            { id: 'b', text: 'map' },
            { id: 'c', text: 'pig' },
          ],
        },
        answerKey: { type: 'MULTIPLE_CHOICE', optionId: 'a' },
      },
    }),
    prisma.question.create({
      data: {
        ...common,
        type: 'WORD_ORDER',
        gradingMode: 'AUTO',
        instruction: 'Put the words in order.',
        instructionVi: 'Sắp xếp từ thành câu',
        config: { type: 'WORD_ORDER', words: ['the nest.', 'We', 'see'], endPunctuation: '.' },
        answerKey: { type: 'WORD_ORDER', accepted: [[1, 2, 0]] },
      },
    }),
    prisma.question.create({
      data: {
        ...common,
        type: 'FILL_BLANK_WORD_BANK',
        gradingMode: 'AUTO',
        instruction: 'Choose a word from the box to complete the sentence.',
        points: 2,
        config: {
          type: 'FILL_BLANK_WORD_BANK',
          wordBank: ['hear', 'taste', 'touch'],
          sentences: [
            { id: 's1', text: 'I ___ the children.' },
            { id: 's2', text: 'We ___ the corn.' },
          ],
        },
        answerKey: {
          type: 'FILL_BLANK_WORD_BANK',
          blanks: [
            { sentenceId: 's1', index: 0, word: 'hear' },
            { sentenceId: 's2', index: 0, word: 'taste' },
          ],
        },
      },
    }),
    prisma.question.create({
      data: {
        ...common,
        type: 'SPEAK',
        gradingMode: 'MANUAL',
        instruction: 'Say the word.',
        points: 2,
        config: { type: 'SPEAK', prompt: 'Say: nest' },
        answerKey: { type: 'SPEAK', rubric: 'Phát âm rõ /n/ đầu từ' },
      },
    }),
  ]);
  const worksheet = await prisma.worksheet.create({
    data: {
      title: 'Letter Nn — Demo',
      subject: 'PHONICS',
      topic: 'Letter Nn',
      grade: 'K',
      week: 9,
      day: 3,
      kind: 'HANDOUT',
      status: 'PUBLISHED',
      visibility: 'SHARED',
      createdById: teacher.id,
      sections: {
        create: [
          { order: 0, title: 'Part 1', instruction: 'Look and circle. Then put the words in order.' },
          { order: 1, title: 'Part 2', instruction: 'Complete the sentence. Then say.' },
        ],
      },
    },
    include: { sections: { orderBy: { order: 'asc' } } },
  });
  const [p1, p2] = worksheet.sections;
  await prisma.worksheetItem.createMany({
    data: [
      { worksheetId: worksheet.id, sectionId: p1.id, order: 0, questionId: questions[0].id },
      { worksheetId: worksheet.id, sectionId: p1.id, order: 1, questionId: questions[1].id },
      { worksheetId: worksheet.id, sectionId: p2.id, order: 0, questionId: questions[2].id },
      { worksheetId: worksheet.id, sectionId: p2.id, order: 1, questionId: questions[3].id },
    ],
  });
  console.log(`[seed] worksheet demo: ${questions.length} câu hỏi + phiếu "${worksheet.title}"`);
}
