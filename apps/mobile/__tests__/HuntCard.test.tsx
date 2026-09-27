import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import { HuntCard } from '@components/HuntCard';
import type { StoredHunt } from '@hunty/types';

/**
 * `Pressable`, the accessibility props, and the navigation call are all the
 * real thing. Only the two edges that reach native modules are doubled:
 *
 * - `expo-router` has no Jest mock in this app.
 * - `@providers/ThemeProvider` cannot be imported on `main` at all:
 *   `providers/ThemeProvider.tsx` declares `import React` twice, which is a
 *   parse error. Doubling `useTheme` keeps this suite about `HuntCard` and
 *   leaves that separate defect alone.
 */
const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('@providers/ThemeProvider', () => ({
  useTheme: () => ({ isDark: false, colors: { border: '#e5e7eb' } }),
}));

// `HuntCoverImage` renders through `expo-image`, which has no Jest mock here.
// Doubling it with react-native's own `Image` leaves `HuntCoverImage` itself
// (and its `@lib/ipfs` gateway logic) real.
jest.mock('expo-image', () => ({
  Image: jest.requireActual('react-native').Image,
}));

// `@components/themed` is a barrel, so importing `ThemedView`/`ThemedCustomText`
// from it also loads `ThemedButton` -> `useHaptics` -> `expo-haptics`, which
// ships untranspiled ESM. `HuntCard` renders no button, so stub the module
// rather than widening `transformIgnorePatterns` for every suite.
jest.mock('expo-haptics', () => ({
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  notificationAsync: jest.fn(),
  impactAsync: jest.fn(),
  selectionAsync: jest.fn(),
}));

const hunt: StoredHunt = {
  id: 7,
  title: 'Downtown Dash',
  description: 'Five clues across the old town.',
  cluesCount: 5,
  status: 'Active',
  rewardType: 'XLM',
};

describe('HuntCard', () => {
  beforeEach(() => {
    mockPush.mockClear();
  });

  it('renders the hunt title and description', () => {
    const { getByText } = render(<HuntCard hunt={hunt} />);

    expect(getByText('Downtown Dash')).toBeTruthy();
    expect(getByText('Five clues across the old town.')).toBeTruthy();
  });

  it('is exposed to screen readers as a button labelled with title and description', () => {
    const { getByTestId } = render(<HuntCard hunt={hunt} />);

    const card = getByTestId('hunt-card-7');
    expect(card.props.accessibilityRole).toBe('button');
    expect(card.props.accessible).toBe(true);
    expect(card.props.accessibilityLabel).toBe('Downtown Dash. Five clues across the old town.');
    expect(card.props.accessibilityHint).toBe('Opens hunt details');
  });

  it('gives each card a testID built from the hunt id', () => {
    const { getByTestId, queryByTestId } = render(<HuntCard hunt={hunt} />);

    expect(getByTestId('hunt-card-7')).toBeTruthy();
    // The old malformed template literal produced `hunt-card-7}`.
    expect(queryByTestId('hunt-card-7}')).toBeNull();
  });

  it('still builds a label when the description is empty', () => {
    const { getByTestId } = render(<HuntCard hunt={{ ...hunt, description: '' }} />);

    expect(getByTestId('hunt-card-7').props.accessibilityLabel).toBe('Downtown Dash. ');
  });

  it('routes to the hunt details screen when pressed', () => {
    const { getByTestId } = render(<HuntCard hunt={hunt} />);

    fireEvent.press(getByTestId('hunt-card-7'));

    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith('/hunt/7');
  });

  it('clamps the description to two lines', () => {
    const { getByText } = render(<HuntCard hunt={hunt} />);

    expect(getByText('Five clues across the old town.').props.numberOfLines).toBe(2);
  });

  it('falls back to the default cover when the hunt has no cover cid', () => {
    const { getByTestId } = render(<HuntCard hunt={hunt} />);

    expect(getByTestId('hunt-cover-image').props.source).toEqual({
      uri: expect.stringContaining('bafybeigdyrzt5sfp7udm7hmhd3km4gq6v2y24sqqew2qnp4o3k4xcoq2a'),
    });
  });

  it('resolves the hunt cover cid through an IPFS gateway', () => {
    const { getByTestId } = render(
      <HuntCard hunt={{ ...hunt, coverImageCid: 'ipfs://custom-cid' }} />,
    );

    expect(getByTestId('hunt-cover-image').props.source).toEqual({
      uri: expect.stringContaining('custom-cid'),
    });
  });

  it('labels the cover image with the hunt title', () => {
    const { getByLabelText } = render(<HuntCard hunt={hunt} />);

    expect(getByLabelText('Downtown Dash cover')).toBeTruthy();
  });
});
