/**
 * Demo seed for Milestone 4(a) School Fee Collection.
 * Idempotent against DEMO acquirer + an ACTIVE school merchant.
 *
 * Usage: npx ts-node --transpile-only prisma/seed-school-fees.ts
 */
import {
  FeeInvoiceStatus,
  FeePaymentChannel,
  FeePaymentRecordStatus,
  FeeReferenceType,
  FeeStructureStatus,
  Prisma,
  PrismaClient,
  StudentStatus,
} from '@prisma/client';
import { appendDammCheckDigit } from '../src/shared/domain/alias/damm.util';

const prisma = new PrismaClient();

const money = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);

async function main() {
  const acquirer = await prisma.acquirer.findFirst({ where: { code: 'DEMO' } });
  if (!acquirer) {
    throw new Error('DEMO acquirer missing — run prisma/seed.ts first');
  }

  let school = await prisma.merchant.findFirst({
    where: {
      acquirerId: acquirer.id,
      isSchool: true,
      status: 'ACTIVE',
      deletedAt: null,
    },
    orderBy: { createdAt: 'asc' },
  });

  if (!school) {
    school = await prisma.merchant.create({
      data: {
        acquirerId: acquirer.id,
        legalName: 'Demo Primary School Ltd',
        tradingName: 'Demo Primary School',
        mcc: '8211',
        isSchool: true,
        status: 'ACTIVE',
        activatedAt: new Date(),
        school: {
          create: {
            registrationNo: 'SCH-DEMO-001',
            headName: 'Head Teacher Demo',
            contactPhone: '+255700000001',
            bursarName: 'Bursar Demo',
          },
        },
        profile: {
          create: {
            city: 'Dar es Salaam',
            postalCode: '11101',
            region: 'Dar es Salaam',
          },
        },
      },
    });
    console.log('Created demo school merchant', school.id);
  } else {
    console.log('Using existing school merchant', school.id);
  }

  const year = await prisma.academicYear.upsert({
    where: {
      merchantId_name: { merchantId: school.id, name: '2026' },
    },
    update: { isCurrent: true },
    create: {
      merchantId: school.id,
      name: '2026',
      isCurrent: true,
      startsOn: new Date('2026-01-01'),
      endsOn: new Date('2026-12-31'),
    },
  });

  const term = await prisma.academicTerm.upsert({
    where: {
      academicYearId_name: { academicYearId: year.id, name: 'Term 1' },
    },
    update: {},
    create: {
      merchantId: school.id,
      academicYearId: year.id,
      name: 'Term 1',
      sequence: 1,
      startsOn: new Date('2026-01-15'),
      endsOn: new Date('2026-04-30'),
    },
  });

  const classLevels = [];
  for (const [i, code] of ['P1', 'P2', 'P3'].entries()) {
    classLevels.push(
      await prisma.classLevel.upsert({
        where: { merchantId_code: { merchantId: school.id, code } },
        update: { name: `Standard ${code.slice(1)}`, sortOrder: i + 1 },
        create: {
          merchantId: school.id,
          code,
          name: `Standard ${code.slice(1)}`,
          sortOrder: i + 1,
        },
      }),
    );
  }
  const p1 = classLevels[0];

  let structure = await prisma.feeStructure.findFirst({
    where: {
      merchantId: school.id,
      academicYearId: year.id,
      academicTermId: term.id,
      classLevelId: p1.id,
      status: FeeStructureStatus.PUBLISHED,
    },
    include: { items: true },
  });

  if (!structure) {
    structure = await prisma.feeStructure.create({
      data: {
        merchantId: school.id,
        academicYearId: year.id,
        academicTermId: term.id,
        classLevelId: p1.id,
        name: 'P1 Term 1 Fees 2026',
        version: 1,
        status: FeeStructureStatus.PUBLISHED,
        publishedAt: new Date(),
        items: {
          create: [
            {
              code: 'TUITION',
              name: 'Tuition',
              amount: money('150000.00'),
              isMandatory: true,
              dueDate: new Date('2026-02-28'),
              sortOrder: 1,
            },
            {
              code: 'TRANSPORT',
              name: 'Transport',
              amount: money('50000.00'),
              isMandatory: false,
              dueDate: new Date('2026-02-28'),
              sortOrder: 2,
            },
            {
              code: 'MEALS',
              name: 'Meals',
              amount: money('40000.00'),
              isMandatory: false,
              dueDate: new Date('2026-02-28'),
              sortOrder: 3,
            },
            {
              code: 'EXAM',
              name: 'Exam Fee',
              amount: money('20000.00'),
              isMandatory: true,
              dueDate: new Date('2026-03-15'),
              sortOrder: 4,
            },
          ],
        },
      },
      include: { items: true },
    });
  }

  const firstNames = [
    'Amina', 'Baraka', 'Chiku', 'David', 'Ester', 'Faraji', 'Grace', 'Hassan',
    'Irene', 'Juma', 'Khadija', 'Lucas', 'Maria', 'Neema', 'Oscar', 'Pendo',
    'Quincy', 'Rehema', 'Samwel', 'Tatu',
  ];

  const students = [];
  for (let i = 0; i < 20; i++) {
    const admissionNo = `ADM2026${String(i + 1).padStart(3, '0')}`;
    const student = await prisma.student.upsert({
      where: {
        merchantId_admissionNo: {
          merchantId: school.id,
          admissionNo,
        },
      },
      update: {
        fullName: `${firstNames[i]} Demo`,
        guardianName: `Guardian ${firstNames[i]}`,
        guardianPhone: `+25571${String(1000000 + i).slice(0, 7)}`,
        status: StudentStatus.ACTIVE,
        isActive: true,
      },
      create: {
        merchantId: school.id,
        admissionNo,
        fullName: `${firstNames[i]} Demo`,
        guardianName: `Guardian ${firstNames[i]}`,
        guardianPhone: `+25571${String(1000000 + i).slice(0, 7)}`,
        status: StudentStatus.ACTIVE,
        isActive: true,
      },
    });
    students.push(student);

    await prisma.studentEnrollment.upsert({
      where: {
        studentId_academicYearId: {
          studentId: student.id,
          academicYearId: year.id,
        },
      },
      update: { classLevelId: p1.id, isCurrent: true, leftAt: null },
      create: {
        merchantId: school.id,
        studentId: student.id,
        academicYearId: year.id,
        classLevelId: p1.id,
        isCurrent: true,
      },
    });
  }

  await prisma.schoolSequence.upsert({
    where: { merchantId: school.id },
    update: {},
    create: { merchantId: school.id, schoolSeq3: '042', lastStudentSeq: 0 },
  });
  const schoolSeq3 = '042';

  await prisma.schoolFeeSettings.upsert({
    where: { merchantId: school.id },
    update: {},
    create: { merchantId: school.id, allocationRule: 'OLDEST_DUE_FIRST' },
  });

  await prisma.feeInvoiceSequence.upsert({
    where: { merchantId: school.id },
    update: {},
    create: { merchantId: school.id, lastInvoice: 0, lastReference: 0 },
  });

  let invoiceSeq = (
    await prisma.feeInvoiceSequence.findUniqueOrThrow({
      where: { merchantId: school.id },
    })
  ).lastInvoice;
  let refSeq = (
    await prisma.feeInvoiceSequence.findUniqueOrThrow({
      where: { merchantId: school.id },
    })
  ).lastReference;

  const subtotal = structure.items.reduce(
    (s, item) => s.plus(item.amount),
    money(0),
  );

  const createdInvoices = [];
  for (const student of students) {
    const existing = await prisma.feeInvoice.findUnique({
      where: {
        studentId_academicTermId: {
          studentId: student.id,
          academicTermId: term.id,
        },
      },
    });
    if (existing) {
      createdInvoices.push(existing);
      continue;
    }
    invoiceSeq += 1;
    refSeq += 1;
    const invoiceNumber = `INV-${schoolSeq3}-20261-${String(invoiceSeq).padStart(6, '0')}`;
    const paymentReference = appendDammCheckDigit(
      `9${schoolSeq3}${String(refSeq).padStart(8, '0').slice(-8)}`,
    );
    const invoice = await prisma.feeInvoice.create({
      data: {
        merchantId: school.id,
        studentId: student.id,
        feeStructureId: structure.id,
        academicTermId: term.id,
        classLevelId: p1.id,
        invoiceNumber,
        paymentReference,
        status: FeeInvoiceStatus.UNPAID,
        subtotalAmount: subtotal,
        totalAmount: subtotal,
        outstandingBalance: subtotal,
        dueDate: new Date('2026-02-28'),
        lines: {
          create: structure.items.map((item) => ({
            feeStructureItemId: item.id,
            code: item.code,
            name: item.name,
            amount: item.amount,
            isMandatory: item.isMandatory,
            dueDate: item.dueDate,
          })),
        },
      },
    });
    createdInvoices.push(invoice);
  }

  await prisma.feeInvoiceSequence.update({
    where: { merchantId: school.id },
    data: { lastInvoice: invoiceSeq, lastReference: refSeq },
  });

  // Sample payments: full, partial, overpay
  const samples = [
    { idx: 0, amount: subtotal, label: 'full' },
    { idx: 1, amount: money('100000.00'), label: 'partial' },
    { idx: 2, amount: subtotal.plus(money('25000.00')), label: 'overpay' },
  ];

  for (const sample of samples) {
    const invoice = createdInvoices[sample.idx];
    if (!invoice) continue;
    const txn = `SEED-MOCK-${sample.label}-${invoice.id.slice(0, 8)}`;
    const prior = await prisma.feePayment.findUnique({
      where: { gatewayTxnRef: txn },
    });
    if (prior) continue;

    const paid = money(invoice.amountPaid).plus(sample.amount);
    const outstanding = Prisma.Decimal.max(money(0), money(invoice.totalAmount).minus(paid));
    const overpayment = Prisma.Decimal.max(money(0), paid.minus(invoice.totalAmount));
    const status =
      outstanding.isZero()
        ? FeeInvoiceStatus.PAID
        : paid.gt(0)
          ? FeeInvoiceStatus.PARTIALLY_PAID
          : FeeInvoiceStatus.UNPAID;

    const payment = await prisma.feePayment.create({
      data: {
        merchantId: school.id,
        invoiceId: invoice.id,
        paymentReference: invoice.paymentReference,
        referenceType: FeeReferenceType.INVOICE,
        resolvedStudentId: invoice.studentId,
        resolvedInvoiceId: invoice.id,
        amountDueAtLookup: invoice.outstandingBalance,
        gatewayTxnRef: txn,
        amount: sample.amount,
        status: FeePaymentRecordStatus.COMPLETED,
        channel: FeePaymentChannel.MOCK,
        payerNameMasked: 'P***r',
        payerMsisdnMasked: '+2557****001',
        paidAt: new Date(),
        gatewayPaidAt: new Date(),
        mmsReceivedAt: new Date(),
        allocations: {
          create: [
            {
              invoiceId: invoice.id,
              merchantId: school.id,
              amount: Prisma.Decimal.min(sample.amount, invoice.totalAmount),
            },
          ],
        },
      },
    });

    await prisma.feeInvoice.update({
      where: { id: invoice.id },
      data: {
        amountPaid: paid,
        outstandingBalance: outstanding,
        status,
      },
    });

    if (overpayment.gt(0)) {
      await prisma.studentAccountCredit.create({
        data: {
          merchantId: school.id,
          studentId: invoice.studentId,
          amount: overpayment,
          reason: `Seed overpayment ${invoice.invoiceNumber}`,
          feePaymentId: payment.id,
        },
      });
    }
  }

  console.log(
    JSON.stringify(
      {
        merchantId: school.id,
        academicYearId: year.id,
        termId: term.id,
        classLevelId: p1.id,
        feeStructureId: structure.id,
        students: students.length,
        invoices: createdInvoices.length,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
