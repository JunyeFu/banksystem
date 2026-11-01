package local.bank.channel.architecture;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;
import static com.tngtech.archunit.core.domain.properties.CanBeAnnotated.Predicates.annotatedWith;
import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.base.DescribedPredicate;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.lang.ArchRule;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.stereotype.Controller;
import org.springframework.stereotype.Service;
import org.springframework.web.bind.annotation.RestController;

class BankModuleArchitectureTest {
  private static JavaClasses bankClasses;

  @BeforeAll
  static void importBankClasses() {
    bankClasses = new ClassFileImporter()
        .withImportOption(new ImportOption.DoNotIncludeTests())
        .importPackages("local.bank.channel");
  }

  static final ArchRule paymentDomainDoesNotDependOnOperations = noClasses()
      .that().resideInAPackage("local.bank.channel.payments..")
      .should().dependOnClassesThat().resideInAPackage("local.bank.channel.operations..");
  static final ArchRule riskDomainDoesNotDependOnPayment = noClasses()
      .that().resideInAPackage("local.bank.channel.risk..")
      .should().dependOnClassesThat().resideInAPackage("local.bank.channel.payments..");
  static final ArchRule controllersDoNotDependOnControllers = noClasses()
      .that(annotatedWith(RestController.class).or(annotatedWith(Controller.class)))
      .should().dependOnClassesThat(DescribedPredicate.describe("Controller implementation",
          (JavaClass candidate) -> !candidate.isAnnotation()
              && (candidate.isAnnotatedWith(RestController.class)
                  || candidate.isAnnotatedWith(Controller.class))));

  static final ArchRule sqlBelongsToRepositories = noClasses()
      .that().areAnnotatedWith(RestController.class).or().areAnnotatedWith(Controller.class)
      .or().areAnnotatedWith(Service.class)
      .should().dependOnClassesThat().resideInAnyPackage("org.springframework.jdbc..", "javax.sql..", "java.sql..");

  @Test
  void paymentBoundary() {
    paymentDomainDoesNotDependOnOperations.check(bankClasses);
  }

  @Test
  void riskBoundary() {
    riskDomainDoesNotDependOnPayment.check(bankClasses);
  }

  @Test
  void controllerBoundary() {
    controllersDoNotDependOnControllers.check(bankClasses);
  }

  @Test
  void repositoryBoundary() {
    sqlBelongsToRepositories.check(bankClasses);
  }

  @Test
  void controllerRuleAcceptsAnnotationsButRejectsControllerReferences() {
    assertDoesNotThrow(() -> controllersDoNotDependOnControllers.check(
        new ClassFileImporter().importClasses(StandaloneController.class)));
    assertThrows(AssertionError.class, () -> controllersDoNotDependOnControllers.check(
        new ClassFileImporter().importClasses(StandaloneController.class, ControllerReference.class)));
  }

  @RestController
  static class StandaloneController {}

  @Controller
  static class ControllerReference {
    StandaloneController controller;
  }
}
