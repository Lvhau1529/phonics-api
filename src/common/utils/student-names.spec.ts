import { describe, expect, it } from 'vitest';
import { applyNameChange, displayNameOf, foldName, nameColumns } from '@/common/utils/student-names';

const an = { vietnameseName: 'Nguyễn Văn An', englishName: 'Andy' };
const binh = { vietnameseName: 'Trần Thị Bình', englishName: null };

describe('foldName', () => {
  it('bỏ dấu, đ → d, chữ thường, gộp khoảng trắng', () => {
    expect(foldName('  NGUYỄN  Thị Đào   Ánh Ưu Ỷ ')).toBe('nguyen thi dao anh uu y');
    expect(foldName('Zoë Müller')).toBe('zoe muller');
  });
});

describe('nameColumns', () => {
  it('tên hiển thị = tên tiếng Anh nếu có; cột tìm gồm cả hai tên; sắp theo tên (từ cuối)', () => {
    expect(nameColumns(an)).toEqual({
      vietnameseName: 'Nguyễn Văn An',
      englishName: 'Andy',
      displayName: 'Andy',
      nameSearch: 'nguyen van an andy',
      nameSortKey: 'an nguyen van an',
    });
    expect(nameColumns(binh)).toMatchObject({
      displayName: 'Trần Thị Bình',
      nameSortKey: 'binh tran thi binh',
    });
  });

  it('trim, gộp khoảng trắng; tên tiếng Anh rỗng → null', () => {
    expect(nameColumns({ vietnameseName: '  Lê   Vy ', englishName: '   ' })).toMatchObject({
      vietnameseName: 'Lê Vy',
      englishName: null,
      displayName: 'Lê Vy',
    });
  });

  it('tên một từ', () => {
    expect(nameColumns({ vietnameseName: 'Bin', englishName: null }).nameSortKey).toBe('bin bin');
  });
});

describe('applyNameChange', () => {
  it('trường mới: đổi / xoá tên tiếng Anh, giữ phần không gửi', () => {
    expect(applyNameChange(an, { englishName: null })).toEqual({
      vietnameseName: 'Nguyễn Văn An',
      englishName: null,
    });
    expect(applyNameChange(binh, { englishName: 'Bella' })).toEqual({
      vietnameseName: 'Trần Thị Bình',
      englishName: 'Bella',
    });
    expect(applyNameChange(an, { vietnameseName: 'Nguyễn Văn Ân' })).toEqual({
      vietnameseName: 'Nguyễn Văn Ân',
      englishName: 'Andy',
    });
  });

  it('displayName (client cũ) sửa tên đang hiển thị; bị bỏ qua khi có trường mới', () => {
    expect(applyNameChange(an, { displayName: 'Andrew' })).toEqual({
      vietnameseName: 'Nguyễn Văn An',
      englishName: 'Andrew',
    });
    expect(applyNameChange(binh, { displayName: 'Trần Bình' })).toEqual({
      vietnameseName: 'Trần Bình',
      englishName: null,
    });
    expect(
      applyNameChange(binh, { displayName: 'X', vietnameseName: 'Trần Thị Bình B' })?.vietnameseName,
    ).toBe('Trần Thị Bình B');
    const after = applyNameChange(an, { displayName: 'Andrew' });
    expect(after && displayNameOf(after)).toBe('Andrew');
  });

  it('không đổi gì → null', () => {
    expect(applyNameChange(an, {})).toBeNull();
    expect(applyNameChange(an, { vietnameseName: ' Nguyễn  Văn An ', englishName: 'Andy' })).toBeNull();
    expect(applyNameChange(binh, { englishName: '  ' })).toBeNull();
  });
});
