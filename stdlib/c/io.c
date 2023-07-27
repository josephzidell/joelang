// write a func called readStr that reads a string of 256 chars from input and returns it

#include <stdio.h>
#include <stdlib.h>

char *readStr() {
	char *str = malloc(256);
	fgets(str, 256, stdin);
	return str;
}

// write a func called readStrN that accepts the number of chars to read from input and returns it

char *readStrN(int n) {
	char *str = malloc(n);
	fgets(str, n, stdin);
	return str;
}

// write a func called readInt that reads an int from input and returns it

int readInt() {
	int i;
	scanf("%d", &i);
	return i;
}

// write a func called readFloat that reads a float from input and returns it

float readFloat() {
	float f;
	scanf("%f", &f);
	return f;
}

// write a func called readDouble that reads a double from input and returns it

double readDouble() {
	double d;
	scanf("%lf", &d);
	return d;
}

// write a func called readChar that reads a char from input and returns it

char readChar() {
	char c;
	scanf("%c", &c);
	return c;
}

// write a func called readLong that reads a long from input and returns it

long readLong() {
	long l;
	scanf("%ld", &l);
	return l;
}

// write a func called readLongLong that reads a long long from input and returns it

long long readLongLong() {
	long long ll;
	scanf("%lld", &ll);
	return ll;
}

// write a func called readShort that reads a short from input and returns it

short readShort() {
	short s;
	scanf("%hd", &s);
	return s;
}

// write a func called readLongDouble that reads a long double from input and returns it

long double readLongDouble() {
	long double ld;
	scanf("%Lf", &ld);
	return ld;
}

// write a func called readUnsignedInt that reads an unsigned int from input and returns it

unsigned int readUnsignedInt() {
	unsigned int ui;
	scanf("%u", &ui);
	return ui;
}

// write a func called readUnsignedLong that reads an unsigned long from input and returns it

unsigned long readUnsignedLong() {
	unsigned long ul;
	scanf("%lu", &ul);
	return ul;
}

// write a func called readUnsignedLongLong that reads an unsigned long long from input and returns it

unsigned long long readUnsignedLongLong() {
	unsigned long long ull;
	scanf("%llu", &ull);
	return ull;
}

// write a func called readUnsignedShort that reads an unsigned short from input and returns it

unsigned short readUnsignedShort() {
	unsigned short us;
	scanf("%hu", &us);
	return us;
}

// write a func called readUnsignedChar that reads an unsigned char from input and returns it

unsigned char readUnsignedChar() {
	unsigned char uc;
	scanf("%hhu", &uc);
	return uc;
}
